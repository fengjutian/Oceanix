//! oceanix-search: File search engine using regex + walkdir.
//! Respects `.gitignore` via the `ignore` crate (built on `walkdir`).

use ignore::WalkBuilder;
use regex::{Regex, RegexBuilder};
use std::collections::VecDeque;
use tracing::{debug, info, info_span, warn};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// Parameters for a search operation.
#[derive(Debug, Clone)]
pub struct SearchParams {
    pub query: String,
    pub include: Option<String>,
    pub exclude: Option<String>,
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub max_results: usize,
    /// Number of context lines to include before and after each match.
    pub surrounding_context: usize,
}

/// A single match found in a file.
#[derive(Debug, Clone)]
pub struct SearchMatch {
    pub file_path: String,
    pub line_number: usize,
    pub column: usize,
    pub line_text: String,
    pub match_start: usize,
    pub match_end: usize,
    /// Context lines before the match: (line_number, text).
    pub context_before: Vec<(usize, String)>,
    /// Context lines after the match: (line_number, text).
    pub context_after: Vec<(usize, String)>,
}

/// Result of a search operation.
#[derive(Debug, Clone)]
pub struct SearchResult {
    pub matches: Vec<SearchMatch>,
    /// True if the search was truncated because max_results was hit.
    pub limit_hit: bool,
}

/// File search engine rooted at a directory.
pub struct SearchEngine {
    root_path: String,
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

impl SearchEngine {
    pub fn new(root_path: impl Into<String>) -> Self {
        Self {
            root_path: root_path.into(),
        }
    }

    /// Walk the directory tree, collecting matches up to `params.max_results`.
    /// Includes context lines before/after each match when `params.surrounding_context > 0`.
    pub fn search(&self, params: &SearchParams) -> SearchResult {
        let _span = info_span!("search", root = %self.root_path, query = %params.query).entered();
        info!("starting search");

        let re = match Self::build_regex(params) {
            Ok(r) => r,
            Err(e) => {
                warn!("invalid regex: {e}");
                return SearchResult {
                    matches: vec![],
                    limit_hit: false,
                };
            }
        };

        let include_pat = params
            .include
            .as_ref()
            .and_then(|g| glob::Pattern::new(g).ok());
        let exclude_pat = params
            .exclude
            .as_ref()
            .and_then(|g| glob::Pattern::new(g).ok());

        let mut matches: Vec<SearchMatch> = Vec::new();
        let ctx = params.surrounding_context;

        let walker = WalkBuilder::new(&self.root_path)
            .hidden(true)
            .git_ignore(true)
            .git_global(true)
            .git_exclude(true)
            .build();

        'outer: for entry in walker {
            let entry = match entry {
                Ok(e) => e,
                Err(err) => {
                    debug!("walk error: {err}");
                    continue;
                }
            };

            if !entry.file_type().map_or(false, |ft| ft.is_file()) {
                continue;
            }

            let path = entry.path();
            let path_str = match path.to_str() {
                Some(s) => s,
                None => continue,
            };

            // Glob filtering
            if let Some(ref inc) = include_pat {
                if !inc.matches(path_str) {
                    continue;
                }
            }
            if let Some(ref exc) = exclude_pat {
                if exc.matches(path_str) {
                    continue;
                }
            }

            // Read all lines (files are typically small enough for this)
            let file = match std::fs::File::open(path) {
                Ok(f) => f,
                Err(err) => {
                    debug!("cannot open {path_str}: {err}");
                    continue;
                }
            };

            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(file);
            let lines: Vec<String> = match reader.lines().collect::<Result<Vec<_>, _>>() {
                Ok(l) => l,
                Err(err) => {
                    debug!("read error in {path_str}: {err}");
                    continue;
                }
            };

            if lines.is_empty() {
                continue;
            }

            let total_lines = lines.len();

            for (line_idx, line_text) in lines.iter().enumerate() {
                let line_number = line_idx + 1;
                let re_iter = re.find_iter(line_text);

                for m in re_iter {
                    if matches.len() >= params.max_results {
                        let limit_hit = Self::collect_context(
                            &lines, path_str, line_number, line_text,
                            m.start(), m.end(), ctx, total_lines,
                            params.max_results, &mut matches,
                        );
                        if limit_hit || matches.len() >= params.max_results {
                            break 'outer;
                        }
                    } else {
                        Self::collect_context(
                            &lines, path_str, line_number, line_text,
                            m.start(), m.end(), ctx, total_lines,
                            params.max_results, &mut matches,
                        );
                    }
                }
            }
        }

        let limit_hit = matches.len() >= params.max_results;
        matches.truncate(params.max_results);
        info!(count = matches.len(), limit_hit, "search complete");
        SearchResult { matches, limit_hit }
    }

    // -- private helpers ----------------------------------------------------

    fn build_regex(params: &SearchParams) -> Result<Regex, regex::Error> {
        let pattern = if params.whole_word {
            format!(r"\b{}\b", params.query)
        } else {
            params.query.clone()
        };
        RegexBuilder::new(&pattern)
            .case_insensitive(!params.case_sensitive)
            .build()
    }

    /// Collect a single match with context lines.
    #[allow(clippy::too_many_arguments)]
    fn collect_context(
        lines: &[String],
        file_path: &str,
        line_number: usize,
        line_text: &str,
        match_start: usize,
        match_end: usize,
        ctx: usize,
        total_lines: usize,
        max: usize,
        results: &mut Vec<SearchMatch>,
    ) -> bool {
        let mut context_before: Vec<(usize, String)> = Vec::new();
        let mut context_after: Vec<(usize, String)> = Vec::new();

        if ctx > 0 {
            // Context before: previous ctx lines, closest first
            let start = if line_number > ctx {
                line_number - ctx
            } else {
                1
            };
            for ln in start..line_number {
                context_before.push((ln, lines[ln - 1].clone()));
            }

            // Context after: next ctx lines
            let end = (line_number + ctx).min(total_lines);
            for ln in (line_number + 1)..=end {
                context_after.push((ln, lines[ln - 1].clone()));
            }
        }

        results.push(SearchMatch {
            file_path: file_path.to_string(),
            line_number,
            column: match_start + 1,
            line_text: line_text.to_string(),
            match_start,
            match_end,
            context_before,
            context_after,
        });

        results.len() >= max
    }
}

// ---------------------------------------------------------------------------
// Crate initialisation
// ---------------------------------------------------------------------------

pub fn init() {
    info!("oceanix-search initialised");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    fn setup_dir(dir: &std::path::Path) {
        fs::create_dir_all(dir.join("sub")).unwrap();
        let mut f = fs::File::create(dir.join("a.txt")).unwrap();
        writeln!(f, "hello world\nfoo bar\nhello again").unwrap();
        let mut g = fs::File::create(dir.join("sub/b.txt")).unwrap();
        writeln!(g, "baz qux\nHELLO upper").unwrap();
    }

    fn default_params(query: &str) -> SearchParams {
        SearchParams {
            query: query.into(),
            include: None,
            exclude: None,
            case_sensitive: false,
            whole_word: false,
            max_results: 10,
            surrounding_context: 0,
        }
    }

    #[test]
    fn basic_search() {
        let tmp = tempfile::tempdir().unwrap();
        setup_dir(tmp.path());

        let engine = SearchEngine::new(tmp.path().to_str().unwrap());
        let result = engine.search(&default_params("hello"));
        assert_eq!(result.matches.len(), 3);
        assert!(!result.limit_hit);
    }

    #[test]
    fn case_sensitive_search() {
        let tmp = tempfile::tempdir().unwrap();
        setup_dir(tmp.path());

        let engine = SearchEngine::new(tmp.path().to_str().unwrap());
        let params = SearchParams {
            case_sensitive: true,
            ..default_params("HELLO")
        };
        let result = engine.search(&params);
        assert_eq!(result.matches.len(), 1);
        assert!(result.matches[0].file_path.ends_with("b.txt"));
    }

    #[test]
    fn include_filter() {
        let tmp = tempfile::tempdir().unwrap();
        setup_dir(tmp.path());

        let engine = SearchEngine::new(tmp.path().to_str().unwrap());
        let params = SearchParams {
            include: Some("*.txt".into()),
            ..default_params("hello")
        };
        let result = engine.search(&params);
        assert_eq!(result.matches.len(), 3);
    }

    #[test]
    fn max_results_and_limit_hit() {
        let tmp = tempfile::tempdir().unwrap();
        setup_dir(tmp.path());

        let engine = SearchEngine::new(tmp.path().to_str().unwrap());
        let params = SearchParams {
            max_results: 1,
            ..default_params("hello")
        };
        let result = engine.search(&params);
        assert_eq!(result.matches.len(), 1);
        assert!(result.limit_hit);
    }

    #[test]
    fn invalid_regex_returns_empty() {
        let engine = SearchEngine::new("/tmp");
        let params = SearchParams {
            query: "[".into(),
            ..default_params("")
        };
        let result = engine.search(&params);
        assert!(result.matches.is_empty());
    }

    #[test]
    fn whole_word_matching() {
        let tmp = tempfile::tempdir().unwrap();
        setup_dir(tmp.path());

        let engine = SearchEngine::new(tmp.path().to_str().unwrap());
        let params = SearchParams {
            whole_word: true,
            ..default_params("bar")
        };
        let result = engine.search(&params);
        assert_eq!(result.matches.len(), 1);
        assert!(result.matches[0].line_text.contains("foo bar"));
    }

    #[test]
    fn surrounding_context() {
        let tmp = tempfile::tempdir().unwrap();
        // Create a file with enough lines to test context
        let mut f = fs::File::create(tmp.path().join("ctx.txt")).unwrap();
        writeln!(f, "line1: no match here").unwrap();
        writeln!(f, "line2: before target").unwrap();
        writeln!(f, "line3: TARGET is here").unwrap();
        writeln!(f, "line4: after target").unwrap();
        writeln!(f, "line5: no match again").unwrap();

        let engine = SearchEngine::new(tmp.path().to_str().unwrap());
        let params = SearchParams {
            surrounding_context: 1,
            case_sensitive: true,
            ..default_params("TARGET")
        };
        let result = engine.search(&params);
        assert_eq!(result.matches.len(), 1);
        let m = &result.matches[0];
        assert_eq!(m.line_number, 3);
        assert_eq!(m.context_before.len(), 1);
        assert_eq!(m.context_before[0], (2, "line2: before target".into()));
        assert_eq!(m.context_after.len(), 1);
        assert_eq!(m.context_after[0], (4, "line4: after target".into()));
    }

    #[test]
    fn context_at_edges() {
        let tmp = tempfile::tempdir().unwrap();
        let mut f = fs::File::create(tmp.path().join("edges.txt")).unwrap();
        writeln!(f, "FIRST line").unwrap();
        writeln!(f, "second line").unwrap();
        writeln!(f, "third line").unwrap();
        writeln!(f, "fourth line").unwrap();
        writeln!(f, "LAST line").unwrap();

        let engine = SearchEngine::new(tmp.path().to_str().unwrap());
        // Search for first line — context_before should be empty
        let params = SearchParams {
            surrounding_context: 2,
            case_sensitive: true,
            ..default_params("FIRST")
        };
        let result = engine.search(&params);
        assert_eq!(result.matches.len(), 1);
        assert!(result.matches[0].context_before.is_empty());
        assert_eq!(result.matches[0].context_after.len(), 2);

        // Search for last line — context_after should be empty
        let params = SearchParams {
            surrounding_context: 2,
            case_sensitive: true,
            ..default_params("LAST")
        };
        let result = engine.search(&params);
        assert_eq!(result.matches.len(), 1);
        assert_eq!(result.matches[0].context_before.len(), 2);
        assert!(result.matches[0].context_after.is_empty());
    }
}

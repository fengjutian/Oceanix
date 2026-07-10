//! oceanix-search: File search engine using regex + walkdir.
//! Respects `.gitignore` via the `ignore` crate (built on `walkdir`).

use ignore::WalkBuilder;
use regex::{Regex, RegexBuilder};
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
    pub max_results: usize,
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
    pub fn search(&self, params: &SearchParams) -> Vec<SearchMatch> {
        let _span = info_span!("search", root = %self.root_path, query = %params.query).entered();
        info!("starting search");

        let re = match Self::build_regex(params) {
            Ok(r) => r,
            Err(e) => {
                warn!("invalid regex: {e}");
                return vec![];
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

        let mut results: Vec<SearchMatch> = Vec::new();

        let walker = WalkBuilder::new(&self.root_path)
            .hidden(true)
            .git_ignore(true)
            .git_global(true)
            .git_exclude(true)
            .build();

        for entry in walker {
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

            // Read and search line-by-line
            match std::fs::File::open(path) {
                Ok(file) => {
                    use std::io::{BufRead, BufReader};
                    let reader = BufReader::new(file);
                    for (line_idx, line) in reader.lines().enumerate() {
                        match line {
                            Ok(line_text) => {
                                Self::search_in_line(
                                    &re,
                                    path_str,
                                    line_idx + 1,
                                    &line_text,
                                    params.max_results,
                                    &mut results,
                                );
                                if results.len() >= params.max_results {
                                    break;
                                }
                            }
                            Err(err) => debug!("line read error: {err}"),
                        }
                    }
                }
                Err(err) => debug!("cannot open {path_str}: {err}"),
            }

            if results.len() >= params.max_results {
                break;
            }
        }

        results.truncate(params.max_results);
        info!(count = results.len(), "search complete");
        results
    }

    // -- private helpers ----------------------------------------------------

    fn build_regex(params: &SearchParams) -> Result<Regex, regex::Error> {
        RegexBuilder::new(&params.query)
            .case_insensitive(!params.case_sensitive)
            .build()
    }

    fn search_in_line(
        re: &Regex,
        file_path: &str,
        line_number: usize,
        line_text: &str,
        max: usize,
        results: &mut Vec<SearchMatch>,
    ) {
        for m in re.find_iter(line_text) {
            if results.len() >= max {
                return;
            }
            results.push(SearchMatch {
                file_path: file_path.to_string(),
                line_number,
                column: m.start() + 1,
                line_text: line_text.to_string(),
                match_start: m.start(),
                match_end: m.end(),
            });
        }
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

    #[test]
    fn basic_search() {
        let tmp = tempfile::tempdir().unwrap();
        setup_dir(tmp.path());

        let engine = SearchEngine::new(tmp.path().to_str().unwrap());
        let params = SearchParams {
            query: "hello".into(),
            include: None,
            exclude: None,
            case_sensitive: false,
            max_results: 10,
        };

        let results = engine.search(&params);
        assert_eq!(results.len(), 3); // two in a.txt, one in sub/b.txt (case-insensitive)
    }

    #[test]
    fn case_sensitive_search() {
        let tmp = tempfile::tempdir().unwrap();
        setup_dir(tmp.path());

        let engine = SearchEngine::new(tmp.path().to_str().unwrap());
        let params = SearchParams {
            query: "HELLO".into(),
            include: None,
            exclude: None,
            case_sensitive: true,
            max_results: 10,
        };

        let results = engine.search(&params);
        assert_eq!(results.len(), 1); // only sub/b.txt
        assert_eq!(results[0].file_path.ends_with("b.txt"), true);
    }

    #[test]
    fn include_filter() {
        let tmp = tempfile::tempdir().unwrap();
        setup_dir(tmp.path());

        let engine = SearchEngine::new(tmp.path().to_str().unwrap());
        let params = SearchParams {
            query: "hello".into(),
            include: Some("*.txt".into()),
            exclude: None,
            case_sensitive: false,
            max_results: 10,
        };

        let results = engine.search(&params);
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn max_results_truncates() {
        let tmp = tempfile::tempdir().unwrap();
        setup_dir(tmp.path());

        let engine = SearchEngine::new(tmp.path().to_str().unwrap());
        let params = SearchParams {
            query: "hello".into(),
            include: None,
            exclude: None,
            case_sensitive: false,
            max_results: 1,
        };

        let results = engine.search(&params);
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn invalid_regex_returns_empty() {
        let engine = SearchEngine::new("/tmp");
        let params = SearchParams {
            query: "[".into(),
            include: None,
            exclude: None,
            case_sensitive: false,
            max_results: 10,
        };
        assert!(engine.search(&params).is_empty());
    }
}

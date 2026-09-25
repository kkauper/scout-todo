pub const DEFAULT_URL: &str = "https://scout.kauper.co";

pub fn scout_url() -> &'static str {
    option_env!("SCOUT_URL").unwrap_or(DEFAULT_URL)
}

/// True if `url` should be opened inside the app's own webview (the Tauri
/// internals, `about:` pages, or the Scout origin itself). Everything else
/// (external links) should be opened in the default browser instead.
pub fn is_internal(url: &url::Url, scout: &url::Url) -> bool {
    if url.scheme() == "tauri" || url.scheme() == "about" {
        return true;
    }
    if url.host_str() == Some("tauri.localhost") {
        return true;
    }
    url.origin() == scout.origin()
}

/// True if `url` is safe to hand off to the system's default-browser opener.
/// Only `http`, `https`, and `mailto` are allowed; everything else (e.g.
/// `file:`, `data:`, `javascript:`, `ftp:`) is rejected so a script on the
/// page can't use external navigation to launch local apps/files.
pub fn is_openable_externally(url: &url::Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scout() -> url::Url {
        url::Url::parse(DEFAULT_URL).unwrap()
    }

    #[test]
    fn scout_origin_with_path_is_internal() {
        let url = url::Url::parse("https://scout.kauper.co/board/123").unwrap();
        assert!(is_internal(&url, &scout()));
    }

    #[test]
    fn tauri_scheme_is_internal() {
        let url = url::Url::parse("tauri://localhost/index.html").unwrap();
        assert!(is_internal(&url, &scout()));
    }

    #[test]
    fn tauri_localhost_host_is_internal() {
        let url = url::Url::parse("http://tauri.localhost/index.html").unwrap();
        assert!(is_internal(&url, &scout()));
    }

    #[test]
    fn about_blank_is_internal() {
        let url = url::Url::parse("about:blank").unwrap();
        assert!(is_internal(&url, &scout()));
    }

    #[test]
    fn other_site_is_not_internal() {
        let url = url::Url::parse("https://github.com/x").unwrap();
        assert!(!is_internal(&url, &scout()));
    }

    #[test]
    fn lookalike_domain_is_not_internal() {
        let url = url::Url::parse("https://scout.kauper.co.evil.com").unwrap();
        assert!(!is_internal(&url, &scout()));
    }

    #[test]
    fn wrong_scheme_is_not_internal() {
        let url = url::Url::parse("http://scout.kauper.co").unwrap();
        assert!(!is_internal(&url, &scout()));
    }

    #[test]
    fn https_is_openable_externally() {
        let url = url::Url::parse("https://github.com/x").unwrap();
        assert!(is_openable_externally(&url));
    }

    #[test]
    fn http_is_openable_externally() {
        let url = url::Url::parse("http://example.com").unwrap();
        assert!(is_openable_externally(&url));
    }

    #[test]
    fn mailto_is_openable_externally() {
        let url = url::Url::parse("mailto:a@b.c").unwrap();
        assert!(is_openable_externally(&url));
    }

    #[test]
    fn file_scheme_is_not_openable_externally() {
        let url = url::Url::parse("file:///Applications/Calculator.app").unwrap();
        assert!(!is_openable_externally(&url));
    }

    #[test]
    fn data_scheme_is_not_openable_externally() {
        let url = url::Url::parse("data:text/html,x").unwrap();
        assert!(!is_openable_externally(&url));
    }

    #[test]
    fn javascript_scheme_is_not_openable_externally() {
        let url = url::Url::parse("javascript:alert(1)").unwrap();
        assert!(!is_openable_externally(&url));
    }

    #[test]
    fn ftp_scheme_is_not_openable_externally() {
        let url = url::Url::parse("ftp://x").unwrap();
        assert!(!is_openable_externally(&url));
    }
}

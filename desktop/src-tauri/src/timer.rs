use std::sync::Mutex;

#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TimerPayload {
    pub task_title: String,
    pub started_at_ms: i64,
}

#[derive(Default)]
pub struct TimerState(pub Mutex<Option<TimerPayload>>);

/// Formats elapsed time between `started_at_ms` and `now_ms` as `h:mm`.
/// Negative elapsed time (clock skew) is clamped to `0:00`.
pub fn format_elapsed(started_at_ms: i64, now_ms: i64) -> String {
    let elapsed_ms = (now_ms - started_at_ms).max(0);
    let total_minutes = elapsed_ms / 60_000;
    let hours = total_minutes / 60;
    let minutes = total_minutes % 60;
    format!("{}:{:02}", hours, minutes)
}

/// Char-safe truncation; appends `…` when the title is cut.
pub fn truncate_title(title: &str, max: usize) -> String {
    if title.chars().count() <= max {
        return title.to_string();
    }
    let truncated: String = title.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", truncated)
}

#[tauri::command]
pub fn timer_changed(
    app: tauri::AppHandle,
    state: tauri::State<TimerState>,
    timer: Option<TimerPayload>,
) {
    *state.0.lock().unwrap() = timer;
    crate::tray::refresh(&app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_elapsed_zero_seconds() {
        assert_eq!(format_elapsed(0, 0), "0:00");
    }

    #[test]
    fn format_elapsed_fifty_nine_seconds() {
        assert_eq!(format_elapsed(0, 59_000), "0:00");
    }

    #[test]
    fn format_elapsed_five_minutes() {
        assert_eq!(format_elapsed(0, 5 * 60_000), "0:05");
    }

    #[test]
    fn format_elapsed_sixty_one_minutes() {
        assert_eq!(format_elapsed(0, 61 * 60_000), "1:01");
    }

    #[test]
    fn format_elapsed_twelve_hours_three_minutes() {
        let ms = (12 * 60 + 3) * 60_000;
        assert_eq!(format_elapsed(0, ms), "12:03");
    }

    #[test]
    fn format_elapsed_negative_is_clamped() {
        assert_eq!(format_elapsed(10_000, 0), "0:00");
    }

    #[test]
    fn truncate_title_short_unchanged() {
        assert_eq!(truncate_title("Short title", 40), "Short title");
    }

    #[test]
    fn truncate_title_long_is_cut_with_ellipsis() {
        let long = "a".repeat(50);
        let result = truncate_title(&long, 40);
        assert_eq!(result.chars().count(), 40);
        assert!(result.ends_with('…'));
    }

    #[test]
    fn truncate_title_multibyte_chars_do_not_panic() {
        let title = "ä".repeat(50);
        let result = truncate_title(&title, 40);
        assert_eq!(result.chars().count(), 40);

        let emoji_title = "🎉".repeat(50);
        let emoji_result = truncate_title(&emoji_title, 40);
        assert_eq!(emoji_result.chars().count(), 40);
    }
}

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_opener::OpenerExt;

fn export_extension(filename: &str) -> Result<&str, String> {
    if filename.contains(['/', '\\']) {
        return Err("Expected a filename, not a path".into());
    }
    let extension = filename.rsplit('.').next().unwrap_or_default();
    match extension {
        "md" | "html" | "docx" | "pdf" => Ok(extension),
        _ => Err("Unsupported export format".into()),
    }
}

// The frontend supplies bytes, never a destination path. Only the user's save
// dialog selects where to write. Async commands keep blocking dialogs off the UI thread.
#[tauri::command]
async fn save_export(
    app: tauri::AppHandle,
    filename: String,
    data: Vec<u8>,
) -> Result<bool, String> {
    let extension = export_extension(&filename)?;
    let selected = app
        .dialog()
        .file()
        .set_title("Save document")
        .set_file_name(&filename)
        .add_filter(extension.to_uppercase(), &[extension])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(false);
    };
    let destination = selected.into_path().map_err(|error| error.to_string())?;
    std::fs::write(destination, data).map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
async fn confirm_action(app: tauri::AppHandle, message: String) -> bool {
    app.dialog()
        .message(message)
        .title("FoliMarkdown")
        .buttons(MessageDialogButtons::OkCancel)
        .blocking_show()
}

#[tauri::command]
async fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|error| error.to_string())?;
    if !matches!(parsed.scheme(), "https" | "http" | "mailto") {
        return Err("Unsupported link type".into());
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_export,
            confirm_action,
            open_external
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start FoliMarkdown");
}

#[cfg(test)]
mod tests {
    use super::export_extension;

    #[test]
    fn accepts_document_exports_only() {
        for name in ["Document.md", "Report.html", "รายงาน.docx", "Print.pdf"] {
            assert!(export_extension(name).is_ok());
        }
        for name in [
            "../file.md",
            "C:\\file.pdf",
            "file.exe",
            "file",
            "file.md.js",
        ] {
            assert!(export_extension(name).is_err());
        }
    }
}

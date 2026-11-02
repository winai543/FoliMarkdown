#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod open_files;

use std::{path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager};
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

#[derive(Default)]
struct PendingFiles(Mutex<Vec<PathBuf>>);

fn enqueue_files(app: &tauri::AppHandle, files: Vec<PathBuf>) {
    let state = app.state::<PendingFiles>();
    let mut pending = state.0.lock().unwrap();
    for path in files {
        if open_files::markdown_path(&path) && !pending.contains(&path) && pending.len() < 100 {
            pending.push(path);
        }
    }
    drop(pending);
    let _ = app.emit("open-markdown-files", ());
}

// No caller-supplied paths: only files delivered by the OS can be read here.
#[tauri::command]
async fn take_open_files(app: tauri::AppHandle) -> Result<Vec<open_files::OpenedDocument>, String> {
    let paths = std::mem::take(&mut *app.state::<PendingFiles>().0.lock().unwrap());
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|path| open_files::read_document(path))
            .collect()
    })
    .await
    .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(PendingFiles::default())
        .plugin(tauri_plugin_single_instance::init(|app, arguments, cwd| {
            enqueue_files(
                app,
                open_files::argument_paths(
                    arguments.into_iter().map(Into::into),
                    std::path::Path::new(&cwd),
                ),
            );
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let cwd = std::env::current_dir()?;
            enqueue_files(
                app.handle(),
                open_files::argument_paths(std::env::args_os(), &cwd),
            );
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_export,
            confirm_action,
            open_external,
            take_open_files
        ])
        .build(tauri::generate_context!())
        .expect("Unable to start FoliMarkdown")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                enqueue_files(
                    app,
                    urls.into_iter()
                        .filter_map(|url| url.to_file_path().ok())
                        .collect(),
                );
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
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

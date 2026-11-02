use std::{
    ffi::OsString,
    io::Read,
    path::{Path, PathBuf},
};

pub const MAX_MARKDOWN_BYTES: u64 = 10 * 1024 * 1024;

pub fn markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

pub fn argument_paths(arguments: impl IntoIterator<Item = OsString>, cwd: &Path) -> Vec<PathBuf> {
    arguments
        .into_iter()
        .skip(1)
        .filter_map(|argument| {
            if argument.to_string_lossy().starts_with('-') {
                return None;
            }
            let path = if argument.to_string_lossy().starts_with("file:") {
                url::Url::parse(&argument.to_string_lossy())
                    .ok()?
                    .to_file_path()
                    .ok()?
            } else {
                let path = PathBuf::from(argument);
                if path.is_absolute() {
                    path
                } else {
                    cwd.join(path)
                }
            };
            markdown_path(&path).then_some(path)
        })
        .collect()
}

#[derive(serde::Serialize)]
pub struct OpenedDocument {
    name: String,
    text: Option<String>,
    error: Option<String>,
}

pub fn read_document(path: &Path) -> OpenedDocument {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let read = || -> Result<String, String> {
        if !markdown_path(path) {
            return Err("Unsupported file type".into());
        }
        let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
        let metadata = file.metadata().map_err(|error| error.to_string())?;
        if !metadata.is_file() || metadata.len() > MAX_MARKDOWN_BYTES {
            return Err("Markdown files must be regular files under 10 MB".into());
        }
        let mut data = Vec::new();
        file.take(MAX_MARKDOWN_BYTES + 1)
            .read_to_end(&mut data)
            .map_err(|error| error.to_string())?;
        if data.len() as u64 > MAX_MARKDOWN_BYTES {
            return Err("Markdown file exceeds 10 MB".into());
        }
        let text =
            String::from_utf8(data).map_err(|_| "Markdown must be UTF-8 encoded".to_string())?;
        Ok(text.trim_start_matches('\u{feff}').to_string())
    };
    match read() {
        Ok(text) => OpenedDocument {
            name,
            text: Some(text),
            error: None,
        },
        Err(error) => OpenedDocument {
            name,
            text: None,
            error: Some(error),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resolves_launch_arguments_and_file_urls() {
        let cwd = std::env::temp_dir();
        let file = cwd.join("รายงาน with spaces.MD");
        let url = url::Url::from_file_path(&file).unwrap();
        let arguments = [
            "app".into(),
            "--flag".into(),
            "notes.markdown".into(),
            "ignore.pdf".into(),
            url.to_string().into(),
        ];
        assert_eq!(
            argument_paths(arguments, &cwd),
            vec![cwd.join("notes.markdown"), file]
        );
    }
    #[test]
    fn reads_utf8_bom_and_rejects_invalid_missing_and_oversized_files() {
        let directory = std::env::temp_dir().join(format!(
            "folimarkdown-open-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let file = directory.join("รายงาน.md");
        std::fs::write(&file, "\u{feff}# ภาษาไทย").unwrap();
        assert_eq!(read_document(&file).text.as_deref(), Some("# ภาษาไทย"));
        std::fs::write(&file, [255, 254]).unwrap();
        assert!(read_document(&file).error.is_some());
        let handle = std::fs::File::create(&file).unwrap();
        handle.set_len(MAX_MARKDOWN_BYTES + 1).unwrap();
        assert!(read_document(&file).error.is_some());
        assert!(read_document(&directory.join("missing.md")).error.is_some());
        assert!(read_document(&directory.join("image.png")).error.is_some());
        drop(handle);
        std::fs::remove_dir_all(directory).unwrap();
    }
}

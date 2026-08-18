#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Діалоги вибору файлу та читання/запис — усе, що потрібно застосунку
        // від системи. Плагін вікна зберігає розмір і позицію між запусками.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("не вдалося запустити застосунок");
}

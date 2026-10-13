export async function readAutosave(page) {
  return page.evaluate(
    async () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("atlasAlignAuditLogicBuilder", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("flows")) {
            db.close();
            resolve(null);
            return;
          }
          const tx = db.transaction("flows", "readonly");
          const get = tx.objectStore("flows").get("autosave");
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            db.close();
            resolve(get.result || null);
          };
        };
      }),
  );
}

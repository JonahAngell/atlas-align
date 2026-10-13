/** Lazy-loads ExcelJS only when an Excel feature is first requested. */
let atlasExcelJsPromise = null;

function atlasEnsureExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!atlasExcelJsPromise) {
    performance.mark?.("atlas.exceljs.load.start");
    atlasExcelJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./vendor/exceljs.min.js";
      script.async = true;
      script.onload = () => {
        performance.mark?.("atlas.exceljs.load.end");
        performance.measure?.(
          "atlas.exceljs.load",
          "atlas.exceljs.load.start",
          "atlas.exceljs.load.end",
        );
        resolve(window.ExcelJS);
      };
      script.onerror = () => {
        atlasExcelJsPromise = null;
        reject(new Error("ExcelJS could not be loaded."));
      };
      document.head.append(script);
    });
  }
  return atlasExcelJsPromise;
}

// Preserve workbook import behavior while keeping ExcelJS off the startup path.
document.addEventListener(
  "change",
  async (event) => {
    if (event.target?.id !== "workbookFile" || !event.target.files?.[0]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      await atlasEnsureExcelJs();
      await importWorkbookFile(event.target.files[0]);
    } catch (error) {
      status?.(`Workbook import failed: ${error.message}`, "bad");
    } finally {
      event.target.value = "";
    }
  },
  true,
);

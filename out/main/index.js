"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const moment = require("moment");
const PDF = require("pdf-parse");
const fs = require("fs");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const icon = path.join(__dirname, "../../resources/icon.png");
let mainWindow;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  const bannedWords = ["Previous Balance", "Total Incoming", "Total Outgoing", "Closing Balance", "Source/Destination", "Transaction Details"];
  function processPdfData(textData) {
    const lineArray = textData.split("\n");
    const csvIdentifier = "~";
    const finalArr = [`date${csvIdentifier}title${csvIdentifier}amount${csvIdentifier}comment`];
    const startPage = lineArray.indexOf("Source/Destination");
    const errors = [];
    for (let i = startPage + 1; i < lineArray.length; i++) {
      const currentDate = lineArray[i];
      if (isValidDateFormat(currentDate)) {
        const rawData = lineArray.slice(i, i + 15);
        if (bannedWords.filter((x) => !rawData.includes(x)).length == 0) {
          continue;
        }
        const transformedLines = transformLines(rawData);
        if (transformedLines) {
          finalArr.push(transformedLines.join(csvIdentifier));
        } else {
          errors.push(`Failed parsed this data: ${rawData.join(" ")}`);
        }
      }
    }
    return { csv: finalArr.join("\n"), errors };
  }
  function transformLines(lines) {
    const regexAmount = /^[+-]\d+$/;
    const indexAmount = lines.findIndex((data) => data.replace(/\./g, "").match(regexAmount));
    const dateTime = moment(lines[0] + " " + lines[1], "DD MMM YYYY HH:mm").format("YYYY-MM-DDTHH:mm:ssZ");
    if (indexAmount !== -1) {
      return [
        dateTime,
        lines[2] + " " + lines[3],
        lines[indexAmount].replace(/[+.]/g, ""),
        lines.slice(4, indexAmount).join(" ")
      ];
    }
    return null;
  }
  function isValidDateFormat(dateString) {
    const dateFormat = "DD MMM YYYY";
    const parsedDate = moment(dateString, dateFormat, true);
    return parsedDate.isValid() && parsedDate.format(dateFormat) === dateString;
  }
  electron.ipcMain.on("parse-file", async (event, filePath) => {
    try {
      const dataBuffer = fs__namespace.readFileSync(filePath);
      const options = {
        pagerender: optionPdf
      };
      const data = await PDF(dataBuffer, options);
      const { csv, errors } = processPdfData(data.text);
      const saveOptions = {
        title: "Save CSV File",
        defaultPath: path__namespace.join(electron.app.getPath("downloads"), path__namespace.basename(filePath, ".pdf") + ".csv"),
        filters: [{ name: "CSV Files", extensions: ["csv"] }]
      };
      const savePath = await electron.dialog.showSaveDialog(mainWindow, saveOptions);
      if (!savePath.canceled && savePath.filePath) {
        fs__namespace.writeFileSync(savePath.filePath, csv);
        event.reply("parse-file-response", { success: true, savePath: savePath.filePath, errors });
      } else {
        event.reply("parse-file-response", { success: false, error: "Save operation cancelled", errors });
      }
    } catch (error) {
      event.reply("parse-file-response", { success: false, error: error.message });
    }
  });
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
function optionPdf(pageData) {
  let render_options = {
    //replaces all occurrences of whitespace with standard spaces (0x20). The default value is `false`.
    normalizeWhitespace: true,
    //do not attempt to combine same line TextItem's. The default value is `false`.
    disableCombineTextItems: false
  };
  return pageData.getTextContent(render_options).then(function(textContent) {
    let text = "";
    for (let i = 0; i < textContent.items.length; i++) {
      let item = textContent.items[i];
      if (item === void 0) {
        continue;
      }
      text += "\n" + item.str;
    }
    return text;
  });
}

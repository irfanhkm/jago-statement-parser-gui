import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import moment from 'moment'
import PDF from 'pdf-parse';
import * as path from 'path';
import * as fs from 'fs';

let mainWindow;

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const bannedWords = ['Previous Balance', 'Total Incoming', 'Total Outgoing', 'Closing Balance', 'Source/Destination', 'Transaction Details'];

  function processPdfData(textData: string) {
    const lineArray = textData.split("\n");
    const csvIdentifier = "~";
    const finalArr = [`date${csvIdentifier}title${csvIdentifier}amount${csvIdentifier}comment`];
    const startPage = lineArray.indexOf("Source/Destination");
    const errors: string[] = [];

    for (let i = startPage + 1; i < lineArray.length; i++) {
        const currentDate = lineArray[i];
        if (isValidDateFormat(currentDate)) {
            const rawData = lineArray.slice(i, i + 15);
            if (bannedWords.filter(x => !rawData.includes(x)).length == 0) {
                continue;
            }
            const transformedLines = transformLines(rawData);
            if (transformedLines) {
                finalArr.push(transformedLines.join(csvIdentifier));
            } else {
              errors.push(`Failed parsed this data: ${rawData.join(' ')}`);
            }
        } 
    }
    return { csv: finalArr.join('\n'), errors };
  }

  function transformLines(lines: string[]) {
    const regexAmount = /^[+-]\d+$/;
    const indexAmount = lines.findIndex(data => data.replace(/\./g, '').match(regexAmount));
    const dateTime = moment(lines[0] + " " + lines[1], 'DD MMM YYYY HH:mm').format('YYYY-MM-DDTHH:mm:ssZ');
    if (indexAmount !== -1) {
      return [
        dateTime,
        lines[2] + " " + lines[3],
        lines[indexAmount].replace(/[+.]/g, ''),
        lines.slice(4, indexAmount).join(" "),
      ];
    }
    return null;
  }

  function isValidDateFormat(dateString: string) {
    const dateFormat = 'DD MMM YYYY';
    const parsedDate = moment(dateString, dateFormat, true);
    return parsedDate.isValid() && parsedDate.format(dateFormat) === dateString;
  }

  ipcMain.on('parse-file', async (event, filePath: string) => {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const options = {
          pagerender: optionPdf
      }
      const data = await PDF(dataBuffer, options);
      const { csv, errors } = processPdfData(data.text);

      const saveOptions = {
        title: 'Save CSV File',
        defaultPath: path.join(app.getPath('downloads'), path.basename(filePath, '.pdf') + '.csv'),
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
      };

      const savePath = await dialog.showSaveDialog(mainWindow!, saveOptions);
      
      if (!savePath.canceled && savePath.filePath) {
        fs.writeFileSync(savePath.filePath, csv);
        event.reply('parse-file-response', { success: true, savePath: savePath.filePath, errors });
      } else {
        event.reply('parse-file-response', { success: false, error: 'Save operation cancelled', errors });
      }
    } catch (error) {
      event.reply('parse-file-response', { success: false, error: error.message });
    }
  });

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
// default render callback

function optionPdf(pageData) {
  //check documents https://mozilla.github.io/pdf.js/
  let render_options = {
      //replaces all occurrences of whitespace with standard spaces (0x20). The default value is `false`.
      normalizeWhitespace: true,
      //do not attempt to combine same line TextItem's. The default value is `false`.
      disableCombineTextItems: false
  }

  return pageData.getTextContent(render_options)
      .then(function(textContent) {
          let lastY, text = '';
          for (let i = 0; i < textContent.items.length; i++) {
              let item = textContent.items[i];
              
              // skipping empty
              if (item === undefined) {
                  continue;
              }
              
              text += '\n' + item.str;
          }
          return text;
      });
}
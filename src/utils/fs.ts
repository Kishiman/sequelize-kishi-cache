
const fs = require('fs');
const path = require('path');

export function clearOrCreateFolder(folderPath: string) {
    if (fs.existsSync(folderPath)) {
        // Folder exists, clear all files within it
        fs.readdirSync(folderPath).forEach((file) => {
            const filePath = path.join(folderPath, file);
            fs.unlinkSync(filePath);
        });
    } else {
        // Folder doesn't exist, create it
        fs.mkdirSync(folderPath, { recursive: true });
    }
}
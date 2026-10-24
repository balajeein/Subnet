import os from 'os';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { nativeImage } from 'electron';

export interface SystemAvatarResult {
  success: boolean;
  dataUrl?: string;
  error?: string;
}

/**
 * Resizes an image (from buffer or file path) to 96x96 JPEG (<45KB payload)
 * suitable for cross-device LAN avatar exchange and display.
 */
function processImageToAvatarDataUrl(img: Electron.NativeImage): SystemAvatarResult {
  if (img.isEmpty()) {
    return { success: false, error: 'Could not decode system profile picture' };
  }
  const resized = img.resize({ width: 96, height: 96, quality: 'better' });
  const jpegBuffer = resized.toJPEG(85);
  const dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;

  if (dataUrl.length > 45000) {
    return { success: false, error: 'Avatar payload exceeds safe size limit' };
  }
  return { success: true, dataUrl };
}

/**
 * Safely executes dscl command for the logged-in macOS user only.
 * Never executes with elevated privileges or scans other users.
 */
function readMacAccountPicture(username: string): Promise<SystemAvatarResult> {
  return new Promise((resolve) => {
    // 1. Try reading raw JPEGPhoto hex stream
    execFile(
      'dscl',
      ['.', '-read', `/Users/${username}`, 'JPEGPhoto'],
      { maxBuffer: 10 * 1024 * 1024, timeout: 4000 },
      (err, stdout) => {
        if (!err && stdout) {
          try {
            const hex = stdout.replace(/^JPEGPhoto:\s*/, '').replace(/[\s\r\n]+/g, '');
            if (hex.length >= 8) {
              const buf = Buffer.from(hex, 'hex');
              // Check JPEG magic SOI (0xFF, 0xD8)
              if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
                const img = nativeImage.createFromBuffer(buf);
                const res = processImageToAvatarDataUrl(img);
                if (res.success) {
                  return resolve(res);
                }
              }
            }
          } catch {
            // Fall through to Picture path check
          }
        }

        // 2. Try reading Picture file path
        execFile(
          'dscl',
          ['.', '-read', `/Users/${username}`, 'Picture'],
          { maxBuffer: 1024 * 1024, timeout: 4000 },
          (err2, stdout2) => {
            if (!err2 && stdout2) {
              try {
                const picturePath = stdout2.replace(/^Picture:\s*/, '').trim();
                if (picturePath && fs.existsSync(picturePath)) {
                  const stat = fs.statSync(picturePath);
                  if (stat.isFile() && stat.size <= 10 * 1024 * 1024) {
                    const img = nativeImage.createFromPath(picturePath);
                    const res = processImageToAvatarDataUrl(img);
                    if (res.success) {
                      return resolve(res);
                    }
                  }
                }
              } catch {
                // Fall through to error
              }
            }

            resolve({
              success: false,
              error: 'No macOS account picture found for the current user.',
            });
          }
        );
      }
    );
  });
}

/**
 * Extensible account picture retrieval across macOS, Linux, and Windows.
 */
export async function getSystemAccountPicture(): Promise<SystemAvatarResult> {
  try {
    const platform = process.platform;
    const username = process.env.USER || process.env.USERNAME || os.userInfo().username;

    if (!username) {
      return { success: false, error: 'Could not determine current system user.' };
    }

    if (platform === 'darwin') {
      return await readMacAccountPicture(username);
    }

    if (platform === 'linux') {
      const homedir = os.homedir();
      const candidates = [
        path.join(homedir, '.face'),
        path.join(homedir, '.face.icon'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          try {
            const stat = fs.statSync(candidate);
            if (stat.isFile() && stat.size <= 10 * 1024 * 1024) {
              const img = nativeImage.createFromPath(candidate);
              const res = processImageToAvatarDataUrl(img);
              if (res.success) return res;
            }
          } catch {
            // Continue search
          }
        }
      }
      return {
        success: false,
        error: 'No ~/.face or ~/.face.icon picture found for the current user.',
      };
    }

    if (platform === 'win32') {
      const appData = process.env.APPDATA;
      if (appData) {
        const accountPicsDir = path.join(appData, 'Microsoft', 'Windows', 'AccountPictures');
        if (fs.existsSync(accountPicsDir)) {
          try {
            const files = fs.readdirSync(accountPicsDir);
            for (const file of files) {
              const fullPath = path.join(accountPicsDir, file);
              const stat = fs.statSync(fullPath);
              if (stat.isFile() && /\.(png|jpg|jpeg)$/i.test(file) && stat.size <= 10 * 1024 * 1024) {
                const img = nativeImage.createFromPath(fullPath);
                const res = processImageToAvatarDataUrl(img);
                if (res.success) return res;
              }
            }
          } catch {
            // Ignore error
          }
        }
      }
      return {
        success: false,
        error: 'No Windows account picture found in AccountPictures.',
      };
    }

    return {
      success: false,
      error: `System account picture extraction is not supported on ${platform}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to retrieve system account picture.',
    };
  }
}

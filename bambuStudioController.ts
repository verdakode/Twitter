import { TpaSession } from '@augmentos/sdk';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class BambuStudioController {
  private session: TpaSession;
  private bambuPath: string;
  private lastDownloadedModel: string | null = null;
  
  constructor(session: TpaSession) {
    this.session = session;
    
    // Set the path to Bambu Studio executable based on OS
    if (process.platform === 'win32') {
      this.bambuPath = 'C:\\Program Files\\Bambu Studio\\BambuStudio.exe';
    } else if (process.platform === 'darwin') {
      this.bambuPath = '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio';
    } else {
      this.bambuPath = '/usr/bin/bambu-studio'; // Linux
    }
  }
  
  openBambuStudio(): void {
    try {
      this.session.layouts.showTextWall("Opening Bambu Studio...");
      
      exec(`"${this.bambuPath}"`, (error) => {
        if (error) {
          this.session.layouts.showTextWall(`Error opening Bambu Studio: ${error.message}`);
          console.error('Error opening Bambu Studio:', error);
        } else {
          this.session.layouts.showTextWall("Bambu Studio opened successfully");
          
          // Give the application time to open
          setTimeout(() => {
            this.focusBambuStudio();
          }, 3000);
        }
      });
    } catch (error) {
      this.session.layouts.showTextWall(`Error launching Bambu Studio: ${error.message}`);
      console.error('Error launching Bambu Studio:', error);
    }
  }
  
  private focusBambuStudio(): void {
    // This is platform-specific and may need adjustment
    try {
      if (process.platform === 'win32') {
        exec('powershell -command "(New-Object -ComObject WScript.Shell).AppActivate(\'Bambu Studio\')"');
      } else if (process.platform === 'darwin') {
        exec('osascript -e \'tell application "Bambu Studio" to activate\'');
      }
      // For Linux, you might need a different approach
    } catch (error) {
      console.error('Error focusing Bambu Studio:', error);
    }
  }
  
  loadModel(modelPath?: string): void {
    try {
      this.session.layouts.showTextWall("Loading model into Bambu Studio...");
      
      // Focus Bambu Studio first
      this.focusBambuStudio();
      
      // Use the provided model path or the last downloaded one
      const filePath = modelPath || this.lastDownloadedModel;
      
      if (!filePath) {
        this.session.layouts.showTextWall("No model available to load");
        return;
      }
      
      // Verify the file exists
      if (!fs.existsSync(filePath)) {
        this.session.layouts.showTextWall(`File not found: ${filePath}`);
        return;
      }
      
      // Use AppleScript to open the file in Bambu Studio (macOS only)
      if (process.platform === 'darwin') {
        const script = `
          tell application "Bambu Studio"
            activate
            open "${filePath}"
          end tell
        `;
        
        exec(`osascript -e '${script}'`, (error) => {
          if (error) {
            this.session.layouts.showTextWall(`Error loading model: ${error.message}`);
            console.error('Error loading model:', error);
          } else {
            this.session.layouts.showTextWall("Model loaded successfully");
          }
        });
      } else if (process.platform === 'win32') {
        // For Windows, we can try to open the file directly
        exec(`"${this.bambuPath}" "${filePath}"`, (error) => {
          if (error) {
            this.session.layouts.showTextWall(`Error loading model: ${error.message}`);
            console.error('Error loading model:', error);
          } else {
            this.session.layouts.showTextWall("Model loaded successfully");
          }
        });
      } else {
        this.session.layouts.showTextWall("Loading models is only supported on macOS and Windows");
      }
    } catch (error) {
      this.session.layouts.showTextWall(`Error loading model: ${error.message}`);
      console.error('Error loading model:', error);
    }
  }
  
  startPrint(): void {
    try {
      this.session.layouts.showTextWall("Starting print process...");
      
      // Focus Bambu Studio
      this.focusBambuStudio();
      
      // For macOS, use AppleScript to simulate clicking
      if (process.platform === 'darwin') {
        const script = `
          tell application "System Events"
            tell process "BambuStudio"
              click menu item "Slice" of menu "Prepare" of menu bar 1
              delay 5
              click menu item "Send to Printer" of menu "Print" of menu bar 1
            end tell
          end tell
        `;
        
        exec(`osascript -e '${script}'`, (error) => {
          if (error) {
            this.session.layouts.showTextWall(`Error starting print: ${error.message}`);
            console.error('Error starting print:', error);
          } else {
            this.session.layouts.showTextWall("Print job started successfully");
          }
        });
      } else {
        this.session.layouts.showTextWall("Automated printing is only supported on macOS");
      }
    } catch (error) {
      this.session.layouts.showTextWall(`Error starting print: ${error.message}`);
      console.error('Error starting print:', error);
    }
  }
  
  setLastDownloadedModel(modelPath: string): void {
    this.lastDownloadedModel = modelPath;
    this.session.layouts.showTextWall(`Model ready: ${path.basename(modelPath)}`);
  }
} 
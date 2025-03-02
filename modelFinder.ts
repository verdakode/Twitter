import { TpaSession } from '@augmentos/sdk';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as AdmZip from 'adm-zip';

export class ModelFinder {
  private session: TpaSession;
  private extractFolder: string;
  private pythonScriptPath: string;
  
  constructor(session: TpaSession) {
    this.session = session;
    this.extractFolder = path.join(__dirname, 'extracted');
    this.pythonScriptPath = path.join(__dirname, 'src', 'modelfinder.py');
    
    // Create extraction folder if it doesn't exist
    if (!fs.existsSync(this.extractFolder)) {
      fs.mkdirSync(this.extractFolder, { recursive: true });
    }
  }
  
  async searchAndDownload(searchTerm: string): Promise<string | null> {
    try {
      this.session.layouts.showTextWall(`Searching for "${searchTerm}" on Thingiverse...`);
      
      // Create a temporary file to pass the search term to the Python script
      const searchTermFile = path.join(__dirname, 'search_term.txt');
      fs.writeFileSync(searchTermFile, searchTerm);
      
      // Run the Python script with the search term
      const downloadedPath = await this.runPythonModelFinder(searchTerm);
      
      if (downloadedPath) {
        this.session.layouts.showTextWall(`Model downloaded to: ${downloadedPath}`);
        
        // Check if it's a zip file and extract if needed
        if (downloadedPath.toLowerCase().endsWith('.zip')) {
          return await this.extractZipFile(downloadedPath, searchTerm);
        }
        
        return downloadedPath;
      } else {
        this.session.layouts.showTextWall(`No models found for "${searchTerm}"`);
        return null;
      }
    } catch (error) {
      this.session.layouts.showTextWall(`Error searching for models: ${error.message}`);
      console.error('Model search error:', error);
      return null;
    }
  }
  
  private runPythonModelFinder(searchTerm: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create a modified version of the Python script that accepts a command line argument
      const tempScriptPath = path.join(__dirname, 'temp_modelfinder.py');
      
      // Read the original Python script
      const originalScript = fs.readFileSync(this.pythonScriptPath, 'utf8');
      
      // Create a modified version that accepts a command line argument
      const modifiedScript = `
import sys
from langchain_openai import ChatOpenAI
from browser_use import Agent
import asyncio
from dotenv import load_dotenv

load_dotenv()

async def main():
    search_term = "${searchTerm.replace(/"/g, '\\"')}"
    
    task = f'go to thingiverse.com, click allow all, click on the search bar, enter "{search_term}", and then hit enter, if there are ads or if it asks you to get a membership, close it, then choose the first thing, then hit download all files, then hit save then log out that file path'
    
    agent = Agent(
        task=task,
        llm=ChatOpenAI(model="gpt-4o"),
    )
    result = await agent.run()
    
    # Print the file path as the last line for the TypeScript code to capture
    if isinstance(result, dict) and 'file_path' in result:
        print(result['file_path'])
    elif isinstance(result, str) and 'download' in result.lower():
        print(result)

asyncio.run(main())
`;
      
      // Write the modified script to a temporary file
      fs.writeFileSync(tempScriptPath, modifiedScript);
      
      this.session.layouts.showTextWall(`Running browser automation to find "${searchTerm}" on Thingiverse...`);
      
      // Execute the Python script
      exec(`python ${tempScriptPath}`, (error, stdout, stderr) => {
        // Clean up the temporary script
        try {
          fs.unlinkSync(tempScriptPath);
        } catch (e) {
          console.error('Error removing temporary script:', e);
        }
        
        if (error) {
          console.error(`Python script error: ${error.message}`);
          console.error(`stderr: ${stderr}`);
          reject(error);
          return;
        }
        
        // Extract the file path from the output
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        
        // Check if the last line looks like a file path
        if (lastLine && (lastLine.includes('/') || lastLine.includes('\\'))) {
          resolve(lastLine.trim());
        } else {
          console.log('Python script output:', stdout);
          reject(new Error('Could not find a valid file path in the Python script output'));
        }
      });
    });
  }
  
  private async extractZipFile(zipFilePath: string, modelName: string): Promise<string | null> {
    try {
      this.session.layouts.showTextWall(`Extracting zip file: ${path.basename(zipFilePath)}...`);
      
      const extractDir = path.join(this.extractFolder, modelName.replace(/[^a-z0-9]/gi, '_').toLowerCase());
      
      // Create extraction directory if it doesn't exist
      if (!fs.existsSync(extractDir)) {
        fs.mkdirSync(extractDir, { recursive: true });
      }
      
      // Extract the zip file
      const zip = new AdmZip(zipFilePath);
      zip.extractAllTo(extractDir, true);
      
      this.session.layouts.showTextWall(`Extraction complete. Looking for printable files...`);
      
      // Find the first STL file in the extracted directory
      const stlFile = this.findFileByExtension(extractDir, '.stl');
      
      if (stlFile) {
        this.session.layouts.showTextWall(`Found printable file: ${path.basename(stlFile)}`);
        return stlFile;
      } else {
        this.session.layouts.showTextWall(`No printable files found in the extracted archive.`);
        return null;
      }
    } catch (error) {
      this.session.layouts.showTextWall(`Error extracting zip file: ${error.message}`);
      console.error('Zip extraction error:', error);
      return null;
    }
  }
  
  private findFileByExtension(directory: string, extension: string): string | null {
    try {
      const files = fs.readdirSync(directory);
      
      for (const file of files) {
        const filePath = path.join(directory, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // Recursively search in subdirectories
          const found = this.findFileByExtension(filePath, extension);
          if (found) return found;
        } else if (file.toLowerCase().endsWith(extension)) {
          return filePath;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error searching for files:', error);
      return null;
    }
  }
} 
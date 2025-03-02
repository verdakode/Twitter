import { TpaServer, TpaSession } from '@augmentos/sdk';
import { TwitterAgent } from './twitterAgent';
import path from 'path';
import fs from 'fs';

class TwitterGlassesApp extends TpaServer {
  // Track state
  private isDisplayingTwitterInfo: boolean = false;
  private twitterChunks: string[] = [];
  private currentChunkIndex: number = 0;
  private autoAdvanceTimer: NodeJS.Timeout | null = null;
  private isAutoAdvancing: boolean = false;
  private readingSpeed: number = 5000; // Default speed (ms per chunk)
  private overlapTime: number = 1800; // Default overlap time

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    // Show welcome message
    session.layouts.showTextWall("Twitter Glasses App Ready!");
    
    // Initialize Twitter agent
    const twitterAgent = new TwitterAgent(session);
    
    // Track glasses status
    let glassesStatus = "Unknown";
    
    // Handle real-time transcription
    const cleanup = [
      session.events.onTranscription((data) => {
        // Process voice commands
        const text = data.text.toLowerCase();
        
        if (data.isFinal) {
          // Twitter profile commands
          if (text.includes("twitter profile") || text.includes("get twitter info")) {
            const username = text.replace(/twitter profile|get twitter info/gi, "").trim();
            if (username) {
              session.layouts.showTextWall(`Getting Twitter info for: ${username}...`);
              twitterAgent.getProfileInfo(username)
                .then(profileInfo => {
                  // Process the profile info into chunks for better reading
                  this.twitterChunks = this.chunkText(profileInfo, 1000, 100);
                  this.currentChunkIndex = 0;
                  this.isDisplayingTwitterInfo = true;
                  
                  // Display the first chunk
                  session.layouts.showTextWall("Twitter profile information retrieved. Starting presentation.", {
                    durationMs: 3000
                  });
                  
                  // Start auto-advancing through the chunks
                  this.startAutoAdvance(session);
                });
            } else {
              session.layouts.showTextWall("Please specify a Twitter username");
            }
          }
          
          // Navigation commands when displaying Twitter info
          else if (this.isDisplayingTwitterInfo) {
            if (text.includes('auto') || text.includes('play') || text.includes('start reading')) {
              // Start auto-advancing through chunks
              this.startAutoAdvance(session);
              session.layouts.showTextWall("Auto-advancing through Twitter info. Say 'pause' to stop.", {
                durationMs: 3000
              });
            } else if (text.includes('faster') || text.includes('speed up')) {
              // Increase reading speed
              this.adjustReadingSpeed(session, -500); // Reduce time between chunks
            } else if (text.includes('slower') || text.includes('slow down')) {
              // Decrease reading speed
              this.adjustReadingSpeed(session, 500); // Increase time between chunks
            } else if (text.includes('next') || text.includes('continue')) {
              // Stop auto-advance if it's running
              this.stopAutoAdvance();
              
              // Manually go to next chunk
              this.currentChunkIndex++;
              if (this.currentChunkIndex >= this.twitterChunks.length) {
                this.currentChunkIndex = this.twitterChunks.length - 1;
                session.layouts.showTextWall("End of Twitter information reached.");
              } else {
                this.displayTwitterChunk(session);
              }
            } else if (text.includes('previous') || text.includes('back')) {
              // Stop auto-advance if it's running
              this.stopAutoAdvance();
              
              this.currentChunkIndex--;
              if (this.currentChunkIndex < 0) {
                this.currentChunkIndex = 0;
                session.layouts.showTextWall("Already at the beginning of Twitter information.");
              } else {
                this.displayTwitterChunk(session);
              }
            } else if (text.includes('stop') || text.includes('exit') || text.includes('pause')) {
              // Stop auto-advance if it's running
              this.stopAutoAdvance();
              
              this.isDisplayingTwitterInfo = false;
              session.layouts.showTextWall("Twitter info reading paused. Say 'resume' to continue reading.", {
                durationMs: 5000
              });
            } else if (text.includes('restart')) {
              // Stop auto-advance if it's running
              this.stopAutoAdvance();
              
              this.currentChunkIndex = 0;
              this.displayTwitterChunk(session);
            }
          }
          // Show glasses status
          else if (text.includes("glasses status") || text.includes("show status")) {
            session.layouts.showTextWall(`Glasses Status: ${glassesStatus}`);
          }
          // Resume Twitter info display
          else if (!this.isDisplayingTwitterInfo && this.twitterChunks.length > 0 && 
                  (text.includes('resume') || text.includes('continue reading'))) {
            this.isDisplayingTwitterInfo = true;
            this.startAutoAdvance(session);
          }
          // Regular transcription display
          else {
            session.layouts.showTextWall(data.text, {
              durationMs: 3000
            });
          }
        } else {
          // Show in-progress transcription only if not displaying Twitter info
          if (!this.isDisplayingTwitterInfo) {
            session.layouts.showTextWall(data.text);
          }
        }
      }),

      session.events.onPhoneNotifications((data) => {
        // Display phone notifications if needed
        session.layouts.showTextWall(`Notification: ${data.title}`, {
          durationMs: 5000
        });
      }),

      session.events.onGlassesBattery((data) => {
        // Update glasses status with battery information
        glassesStatus = `Battery: ${data.level}%, Charging: ${data.charging ? 'Yes' : 'No'}`;
        
        // Show low battery warning
        if (data.level < 20 && !data.charging) {
          session.layouts.showTextWall(`Low Battery Warning: ${data.level}%`, {
            durationMs: 5000
          });
        }
      }),

      session.events.onError((error) => {
        console.error('Error:', error);
        session.layouts.showTextWall(`Error: ${error.message}`, {
          durationMs: 5000
        });
      }),
      
      // Add cleanup for timers when session ends
      () => {
        this.stopAutoAdvance();
      }
    ];

    // Add cleanup handlers
    cleanup.forEach(handler => this.addCleanupHandler(handler));
  }
  
  private displayTwitterChunk(session: TpaSession): void {
    if (this.currentChunkIndex >= 0 && this.currentChunkIndex < this.twitterChunks.length) {
      const chunk = this.twitterChunks[this.currentChunkIndex];
      const progress = `[${this.currentChunkIndex + 1}/${this.twitterChunks.length}]`;
      
      // Display the chunk with progress indicator
      session.layouts.showTextWall(`${progress}\n\n${chunk}`, {
        durationMs: this.readingSpeed,
        preserveLineBreaks: true,
        preserveWhitespace: true
      });
      
      console.log(`Displaying Twitter chunk ${this.currentChunkIndex + 1}/${this.twitterChunks.length}`);
      
      // Pre-load the next chunk to eliminate gaps
      if (this.isAutoAdvancing && this.currentChunkIndex < this.twitterChunks.length - 1) {
        setTimeout(() => {
          if (this.isAutoAdvancing) {
            this.currentChunkIndex++;
            this.displayTwitterChunk(session);
          }
        }, this.readingSpeed - this.overlapTime);
      }
    }
  }
  
  private startAutoAdvance(session: TpaSession): void {
    // Clear any existing timer
    this.stopAutoAdvance();
    
    // Set flag
    this.isAutoAdvancing = true;
    
    // Start displaying chunks immediately
    this.displayTwitterChunk(session);
  }
  
  private stopAutoAdvance(): void {
    // Clear any interval timer
    if (this.autoAdvanceTimer) {
      clearInterval(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    
    // Also clear any pending setTimeout callbacks by setting the flag
    this.isAutoAdvancing = false;
    
    console.log('Auto-advance stopped at chunk', this.currentChunkIndex + 1);
  }

  private adjustReadingSpeed(session: TpaSession, adjustment: number): void {
    const oldSpeed = this.readingSpeed;
    
    // Adjust the reading speed
    this.readingSpeed = Math.max(500, Math.min(10000, this.readingSpeed + adjustment));
    
    // Adjust the overlap time to be slightly less than the reading speed
    this.overlapTime = Math.max(400, this.readingSpeed - 200);
    
    // Provide feedback about the speed change
    let speedMessage = "";
    if (adjustment < 0) {
      speedMessage = `Reading speed increased. Now showing each chunk for ${(this.readingSpeed/1000).toFixed(1)} seconds.`;
    } else {
      speedMessage = `Reading speed decreased. Now showing each chunk for ${(this.readingSpeed/1000).toFixed(1)} seconds.`;
    }
    
    session.layouts.showTextWall(speedMessage, {
      durationMs: 2000
    });
    
    console.log(`Reading speed adjusted from ${oldSpeed}ms to ${this.readingSpeed}ms`);
    
    // If we're currently auto-advancing, restart with the new speed
    if (this.isAutoAdvancing) {
      // Stop the current auto-advance
      this.stopAutoAdvance();
      
      // Wait a moment to show the speed change message
      setTimeout(() => {
        // Restart auto-advance with new speed
        this.startAutoAdvance(session);
      }, 2000);
    }
  }
  
  // Helper function to chunk text into readable segments
  private chunkText(text: string, maxLength: number, overlap: number): string[] {
    const chunks: string[] = [];
    let startPos = 0;
    
    while (startPos < text.length) {
      // Find a good breaking point near maxLength
      let endPos = Math.min(startPos + maxLength, text.length);
      
      // If we're not at the end of the text, try to find a natural break point
      if (endPos < text.length) {
        // Look for a period, question mark, or exclamation followed by a space
        const periodPos = text.lastIndexOf('. ', endPos);
        const questionPos = text.lastIndexOf('? ', endPos);
        const exclamationPos = text.lastIndexOf('! ', endPos);
        
        // Find the closest sentence end that's not too far back
        const minBreakPos = startPos + (maxLength / 2); // Don't go back more than half the chunk
        const breakPos = Math.max(
          periodPos > minBreakPos ? periodPos + 2 : -1,
          questionPos > minBreakPos ? questionPos + 2 : -1,
          exclamationPos > minBreakPos ? exclamationPos + 2 : -1
        );
        
        if (breakPos !== -1) {
          endPos = breakPos;
        } else {
          // If no sentence break, look for a space
          const spacePos = text.lastIndexOf(' ', endPos);
          if (spacePos > minBreakPos) {
            endPos = spacePos + 1;
          }
        }
      }
      
      // Add the chunk
      chunks.push(text.substring(startPos, endPos));
      
      // Move to next chunk with overlap
      startPos = endPos - overlap;
    }
    
    return chunks;
  }
}

// Start the server
// DEV CONSOLE URL: https://augmentos.dev/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new TwitterGlassesApp({
  packageName: 'org.augmentos.twitter', // make sure this matches your app in dev console
  apiKey: 'your_api_key', // Not used right now, play nice
  port: 80, // The port you're hosting the server on
  augmentOSWebsocketUrl: 'wss://staging.augmentos.org/tpa-ws' //AugmentOS url
});

app.start().catch(console.error);

import { TpaServer, TpaSession } from '@augmentos/sdk';
import { ModelFinder } from './modelFinder';
import { BambuStudioController } from './bambuStudioController';

class EnhancedAugmentOSApp extends TpaServer {
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    // Show welcome message
    session.layouts.showTextWall("Enhanced AugmentOS App Ready!");
    
    // Initialize ModelFinder
    const modelFinder = new ModelFinder(session);
    
    // Initialize BambuStudio controller
    const bambuController = new BambuStudioController(session);
    
    // Track glasses status
    let glassesStatus = "Unknown";
    
    // Handle real-time transcription
    const cleanup = [
      session.events.onTranscription((data) => {
        // Process voice commands
        const text = data.text.toLowerCase();
        
        if (data.isFinal) {
          // Model finder commands
          if (text.includes("find model") || text.includes("search model")) {
            const searchTerm = text.replace(/find model|search model/gi, "").trim();
            session.layouts.showTextWall(`Searching for model: ${searchTerm}...`);
            modelFinder.searchAndDownload(searchTerm)
              .then(modelPath => {
                if (modelPath) {
                  // Set the model path in the BambuStudio controller
                  bambuController.setLastDownloadedModel(modelPath);
                }
              });
          }
          
          // Bambu Studio commands
          else if (text.includes("open bambu") || text.includes("start bambu")) {
            session.layouts.showTextWall("Opening Bambu Studio...");
            bambuController.openBambuStudio();
          }
          else if (text.includes("load model")) {
            session.layouts.showTextWall("Loading model into Bambu Studio...");
            bambuController.loadModel();
          }
          else if (text.includes("start print") || text.includes("begin printing")) {
            session.layouts.showTextWall("Starting print job...");
            bambuController.startPrint();
          }
          
          // Show glasses status
          else if (text.includes("glasses status") || text.includes("show status")) {
            session.layouts.showTextWall(`Glasses Status: ${glassesStatus}`);
          }
          
          // Regular transcription display
          else {
            session.layouts.showTextWall(data.text, {
              durationMs: 3000
            });
          }
        } else {
          // Show in-progress transcription
          session.layouts.showTextWall(data.text);
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
      })
    ];

    // Add cleanup handlers
    cleanup.forEach(handler => this.addCleanupHandler(handler));
  }
}

// Start the server
// DEV CONSOLE URL: https://augmentos.dev/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new EnhancedAugmentOSApp({
  packageName: 'org.augmentos.creator', // make sure this matches your app in dev console
  apiKey: 'your_api_key', // Not used right now, play nice
  port: 80, // The port you're hosting the server on
  augmentOSWebsocketUrl: 'wss://staging.augmentos.org/tpa-ws' //AugmentOS url
});

app.start().catch(console.error);

/**
 * LED Music Visualizer
 * by Devon Crawford
 * using the FastLED library: http://fastled.io/
 * April 22, 2018
 * Watch the video: https://youtu.be/lU1GVVU9gLU
 */
#include "FastLED.h"
#define REAL_NUM_LEDS 1100
#define LEDS_PER_CONTROLLER 3
#define NUM_LEDS REAL_NUM_LEDS/LEDS_PER_CONTROLLER        // How many leds in your strip?
#define updateLEDS 2        // How many do you want to update every millisecond?
#define COLOR_SHIFT 180000  // Time for colours to shift to a new spectrum (in ms)
CRGB leds[NUM_LEDS];        // Define the array of leds

// Define the digital I/O PINS..
#define DATA_PIN 6          // led data transfer
#define PITCH_PIN 0         // pitch input from frequency to voltage converter
#define BRIGHT_PIN 4        // brightness input from amplified audio signal

#define maxCommandSize 30 //maximum command size from nodejs

/*
* LED DEFS
*/
// Don't touch these, internal color variation variables
unsigned long setTime = COLOR_SHIFT;
int shiftC = 0;
int mulC = 2;

// Define color structure for rgb
struct color {
  int r;
  int g;
  int b;
};
typedef struct color RGBColor;

//Debug Mode
boolean DEBUGMODE = true;

/*
SERVER CONN STUFF
*/

const char* commandSplitChar=";";
const char* commandValueChar="|";

boolean connected = false;
boolean running = true;
boolean ledsOn = false;

unsigned long lastSendTime = 0;
const int sendConnectInterval = 1000;

void debugPrintln(char *s) {
  if (DEBUGMODE) {
    Serial.println(s);
  }
}
void debugPrint(char *s) {
  if (DEBUGMODE) {
    Serial.print(s);
  }
}

void sendCommand(String command, String *value, uint8_t valueLen) {
  valueLen = (valueLen/sizeof(String));
  Serial.print(command);
  if (valueLen > 0) {
    Serial.print(commandValueChar);
    for (int i=0; i<valueLen; i++) {
      Serial.print(*value);
      *value++;
      if (valueLen > 1 && (i < (valueLen-1))) {
        Serial.print(F(",")); //print comma
      }
    }
  }
  Serial.print(commandSplitChar);
}

void setup() { 
    Serial.begin(9600);
    FastLED.addLeds<NEOPIXEL, DATA_PIN>(leds, NUM_LEDS);
    pinMode(A0, INPUT);
    pinMode(A4, INPUT);

    //Make all LEDS dark to start
    clearLEDS();

    //Run init pattern to show LEDS working
    for (int i=1; i<NUM_LEDS; i++) {
      leds[i] = CRGB::Red;
      leds[i-1] = CRGB::Black;
      FastLED.show();
      delay(25);
    }
}

void loop() { 
  if (running) {
    String input = Serial.readString();
    input.trim();
    if (connected == false) { //Are we connected to the server?
      input.toLowerCase(); //Modify input to be case-insentitive
      if (millis()-lastSendTime >= sendConnectInterval) { //output every second
        Serial.print(F("AOK")); //Respond to server's request for our input
        Serial.print(commandSplitChar);
        lastSendTime+=sendConnectInterval;
      }
      if (input.indexOf("sok")>-1) {
        Serial.print(F("CONN"));
        Serial.print(commandSplitChar);
        connected = true;
      }
    } else {
      processCommand(input); //This will recurse
    }
  }

  unsigned long time = millis();

  if (ledsOn) {
    // Shift the color spectrum by 200 on set intervals (setTime)
    if(time / (double)setTime >= 1) {
      setTime = time + COLOR_SHIFT;
      Serial.println(setTime);
      shiftC += 200;
      mulC++;
      if(shiftC >= 600) {
        shiftC = 0;
      }
      if(mulC > 3) {
        mulC = 2;
      }
    }

    // Shift all LEDs to the right by updateLEDS number each time
    for(int i = NUM_LEDS - 1; i >= updateLEDS; i--) {
      leds[i] = leds[i - updateLEDS];
    }

    // Get the pitch and brightness to compute the new color
    int newPitch = (analogRead(PITCH_PIN)*2) + shiftC;
    RGBColor nc = pitchConv(newPitch, analogRead(BRIGHT_PIN));

    // Set the left most updateLEDs with the new color
    for(int i = 0; i < updateLEDS; i++) {
      leds[i] = CRGB(nc.r, nc.g, nc.b);
    }
    FastLED.show();
  }
  
  delay(1);
}

void processCommand(String input) {
  if (input.indexOf(commandSplitChar)>-1) { //validate that it is a command
    //int stind = input.indexOf(commandSplitChar);
    int endind = input.indexOf(commandSplitChar);
    int valind = input.indexOf(commandValueChar);

    String command = "";
    String value = "";

    if (valind == -1) {
      command = input.substring(0,endind);
    } else {
      command = input.substring(0,valind);
      value = input.substring(valind+1,endind);
    }

    command.toLowerCase(); //conv command to lowercase

    if (command == F("debugon")) {
      DEBUGMODE = true;
    } else if (command == F("debugoff")) {
      DEBUGMODE = false;
    } else if (command == F("leds_on")) {
      ledsOn = true;
    } else if (command == F("leds_off")) {
      ledsOn = false;
        clearLEDS();
    } else {
      Serial.print(F("UNC|"));
      Serial.print(command);
      Serial.print(F(";"));
    }

    input = input.substring(endind+1);
    if (input != "") { //more commands exist for us to read
      processCommand(input); //Recurse
    }
  }
}

void clearLEDS() {
  for(int i = 0; i < NUM_LEDS ; i++) {
    leds[i] = CRGB::Black;
  }
  FastLED.show();
}

/**
 * Converts the analog brightness reading into a percentage
 * 100% brightness is 614.. about 3 volts based on frequency to voltage converter circuit
 * The resulting percentage can simply be multiplied on the rgb values when setting our colors,
 * for example black is (0,0,0) so when volume is off we get 0v and all colors are black (leds are off)
 */
double convBrightness(int b) {
  double c = b / 614.0000;
  if( c < 0.2 ) {
    c = 0;
  }
  else if(c > 1) {
    c = 1.00;
  }
  return c;
}

/**
 * Creates a new color from pitch and brightness readings
 * int p         analogRead(pitch) representing the voltage between 0 and 5 volts
 * double b      analogRead(brightness) representing volume of music for LED brightness
 * returns RGBColor structure with rgb values, which appear synced to the music
 */
RGBColor pitchConv(int p, int b) {
  RGBColor c;
  double bright = convBrightness(b);

  if(p < 40) {
    setRGBColor(&c, 255, 0, 0);
  }
  else if(p >= 40 && p <= 77) {
    int b = (p - 40) * (255/37.0000);
    setRGBColor(&c, 255, 0, b);
  }
  else if(p > 77 && p <= 205) {
    int r = 255 - ((p - 78) * 2);
    setRGBColor(&c, r, 0, 255);
  }
  else if(p >= 206 && p <= 238) {
    int g = (p - 206) * (255/32.0000);
    setRGBColor(&c, 0, g, 255);
  }
  else if(p <= 239 && p <= 250) {
    int r = (p - 239) * (255/11.0000);
    setRGBColor(&c, r, 255, 255);
  }
  else if(p >= 251 && p <= 270) {
    setRGBColor(&c, 255, 255, 255);
  }
  else if(p >= 271 && p <= 398) {
    int rb = 255-((p-271)*2);
    setRGBColor(&c, rb, 255, rb);
  }
  else if(p >= 398 && p <= 653) {
    setRGBColor(&c, 0, 255-(p-398), (p-398));
  }
  else {
    setRGBColor(&c, 255, 0, 0);
  }
  setRGBColor(&c, c.r * bright, c.g * bright, c.b * bright);
  return c;
}

void setRGBColor(RGBColor *c, int r, int g, int b) {
  c->r = r;
  c->g = g;
  c->b = b;
}

// Prints color structure data
void printRGBColor(RGBColor c) {
  Serial.print(F("( "));
  Serial.print(c.r);
  Serial.print(F(", "));
  Serial.print(c.g);
  Serial.print(F(", "));
  Serial.print(c.b);
  Serial.println(F(" )"));
}

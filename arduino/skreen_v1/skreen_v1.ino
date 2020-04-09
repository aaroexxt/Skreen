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
#define LED_TYPE    WS2811
#define LED_COLOR_ORDER BRG //I'm using a BRG led strip which is kinda wacky

#define updateLEDS 3        // How many do you want to update every millisecond?
CRGB leds[NUM_LEDS];        // Define the array of leds

// Define the digital I/O PINS..
#define LED_DATA_PIN 3          // led data transfer
#define maxCommandSize 30 //maximum command size from nodejs

int currentAudioValue;

const int frequencyBufferSize = 7; //Taken as soon as audio signal changes high -> low or reverse
int freqBuffer[frequencyBufferSize];
int freqProcBuffer[frequencyBufferSize];
int fbIndex = 0;

const int volumeBufferSize = 40; //Taken in 10ms increments
int volBuffer[volumeBufferSize];
int volProcBuffer[frequencyBufferSize]; //Dw about why its fBuf
int vbIndex = 0;
int vbPIndex = 0;

long lastVolUpdateMillis = 0;
long onTimeMicros;
long lastOTM;
long offTimeMicros;
long lastoTM;
boolean gotHigh = false;
boolean gotLow = true;
#define audioMiddle 127
#define audioLevelDeltaTrigger 7
#define volumeMax 225

long curPeriod = 0;
int curFreq = 0;

int processedFreq = 0;
int processedVolume = 0;

int avgProcessedFreq = 0;
int avgProcessedVolume = 0;

/*
* LED DEFS
*/

// Define color structure for rgb
struct color {
  int r;
  int g;
  int b;
};
typedef struct color RGBColor;

//Debug Mode
boolean DEBUGMODE = false;

/*
SERVER CONN STUFF
*/

const char* commandSplitChar=";";
const char* commandValueChar="|";

boolean ledsOn = false;

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
    Serial.begin(115200);
    FastLED.addLeds<LED_TYPE, LED_DATA_PIN, LED_COLOR_ORDER>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
    

    //Initialize averaging buffer
    for (int i=0; i<frequencyBufferSize; i++) {
      //Frequency buffer initialization
      freqBuffer[i] = 0;
      freqProcBuffer[i] = 0;

      //Volume buffer initialization
      volProcBuffer[i] = 0;
    }

    for (int i=0; i<volumeBufferSize; i++) {
      volBuffer[i] = 0;
    }


    cli();//disable interrupts
    
    //set up continuous sampling of analog pin 0
    
    //clear ADCSRA and ADCSRB registers
    ADCSRA = 0;
    ADCSRB = 0;
    
    ADMUX |= (1 << REFS0); //set reference voltage
    ADMUX |= (1 << ADLAR); //left align the ADC value- so we can read highest 8 bits from ADCH register only
    
    ADCSRA |= (1 << ADPS2) | (1 << ADPS0); //set ADC clock with 32 prescaler- 16mHz/32=500kHz
    ADCSRA |= (1 << ADATE); //enabble auto trigger
    ADCSRA |= (1 << ADIE); //enable interrupts when measurement complete
    ADCSRA |= (1 << ADEN); //enable ADC
    ADCSRA |= (1 << ADSC); //start ADC measurements
    
    sei();//enable interrupts

    //Make all LEDS dark to start
    clearLEDS();

    //Run init pattern to show LEDS working
    for (int i=1; i<NUM_LEDS; i++) {
      leds[i] = CRGB::Red;
      leds[i-1] = CRGB::Black;
      FastLED.show();
      delay(1);
    }
}

ISR(ADC_vect) {//when new ADC value ready
  currentAudioValue = ADCH; //update the variable currentAudioValue with new value from A0 (between 0 and 255)
  long curMicros = micros();

  if (gotLow) {
    if (currentAudioValue > audioMiddle+audioLevelDeltaTrigger) {
      
      onTimeMicros = lastOTM-curMicros;
      lastOTM = curMicros;

      gotHigh = true;
      gotLow = false;
    }
  } else if (gotHigh) {
    if (currentAudioValue < audioMiddle-audioLevelDeltaTrigger) {
      offTimeMicros = lastoTM-curMicros;
      lastoTM = curMicros;

      curPeriod = onTimeMicros+offTimeMicros;
      curFreq = (int)(-2.0*1000000.0/curPeriod);

      if (curFreq < 0) {
        curFreq = 0;
      }

      //Write to next element of buffer to avoid O(n-1) shift code, just O(1)
      freqBuffer[fbIndex] = curFreq;

      //Freq is max value in buffer (from empirical testing LETS TRY IT LOL)
      processedFreq = freqBuffer[0];
      for (int i=1; i<frequencyBufferSize; i++) {
        if (freqBuffer[i] > processedFreq) {
          processedFreq = freqBuffer[i];
        }
      }

      freqProcBuffer[fbIndex] = processedFreq;
      fbIndex++;
      if (fbIndex > frequencyBufferSize-1) {
        fbIndex = 0;
      }

      //Averaged freq is the new average of the freqProcBuffer
      avgProcessedFreq = freqProcBuffer[0];
      for (int i=1; i<frequencyBufferSize; i++) {
        avgProcessedFreq += freqProcBuffer[i];
      }
      avgProcessedFreq /= frequencyBufferSize; //will auto do floor

      gotLow = true;
      gotHigh = false;
    }
  }

  //Basic range checks
  if (curMicros-lastOTM > 33333.0) { //If last peak audio signal is less than 30Hz (about limit of hardware) or greater than 2500Hz (top limit of hardware)
    curFreq = 0; //Default freq to 0
    processedFreq = 0;
    avgProcessedFreq = 0;
  }
}

void loop() { 
  if (Serial.available() > 0) {
    String input = Serial.readString();
    input.trim();
    processCommand(input); //This will recurse
  }

  unsigned long time = millis();
  if (time - lastVolUpdateMillis > 10) { //Every 10ms sample audio, this gives 100Hz check rate
    lastVolUpdateMillis = time;

    volBuffer[vbIndex] = currentAudioValue;
    vbIndex++;
    if (vbIndex > volumeBufferSize-1) {
      vbIndex = 0;
    }


    //Volume is max value in buffer (from empirical testing LETS TRY IT LOL)
    processedVolume = volBuffer[0];
    for (int i=1; i<volumeBufferSize; i++) {
      if (volBuffer[i] > processedVolume) {
        processedVolume = volBuffer[i];
      }
    }
    processedVolume = map(processedVolume, audioMiddle, volumeMax, 0, 100);

    volProcBuffer[vbPIndex] = processedVolume;
    vbPIndex++;
    if (vbPIndex > frequencyBufferSize-1) {
      vbPIndex = 0;
    }

    avgProcessedVolume = volProcBuffer[0];
    for (int i=1; i<frequencyBufferSize; i++) {
      avgProcessedVolume+=volProcBuffer[i];
    }
    avgProcessedVolume /= frequencyBufferSize;

  }

  avgProcessedVolume = (avgProcessedVolume < 0) ? -avgProcessedVolume : avgProcessedVolume;
  if (avgProcessedFreq <= 0) {
    avgProcessedFreq = 0;
  }

  /*
  Serial.print("Hz:");
  Serial.print(avgProcessedFreq);
  Serial.print(", Vol: ");
  Serial.println(avgProcessedVolume);
  */

  if (ledsOn) {
    // Shift all LEDs to the right by updateLEDS number each time
    for(int i = NUM_LEDS - 1; i >= updateLEDS; i--) {
      leds[i] = leds[i - updateLEDS];
    }

    RGBColor nc = pitchConv(avgProcessedFreq, avgProcessedVolume);
    if (DEBUGMODE) {
      printRGBColor(nc);
    }

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

    if (command.equals("debugon")) {
      DEBUGMODE = true;
      Serial.print("DEBUG|true;");
    } else if (command.equals("debugoff")) {
      DEBUGMODE = false;
      Serial.print("DEBUG|false;");
    } else if (command.equals("leds_on")) {
      ledsOn = true;
      Serial.print("LEDS|true;");
    } else if (command.equals("leds_off")) {
      ledsOn = false;
      Serial.print("LEDS|false;");
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
 * 100% brightness is 100.. about 3 volts based on frequency to voltage converter circuit
 * The resulting percentage can simply be multiplied on the rgb values when setting our colors,
 * for example black is (0,0,0) so when volume is off we get 0v and all colors are black (leds are off)
 */
double convBrightness(int b) {
  double c = b / 100.0000;
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

  if (p < 0) {
    p = 0;
  }

  /*Serial.print(p);
  Serial.print(",");
  Serial.println(b);*/

  //Assuming ~3000hz max

  int pScaled = map(p, 0, getRangeMax(p), 0, 255);
  pScaled = constrain(pScaled, 0, 255);

  if (DEBUGMODE) {
    Serial.print("B:");
    Serial.print(bright);
    Serial.print(",R=");
    Serial.print(getRGBRange(p));
    Serial.print(", ");
    Serial.print(p);
    Serial.print(":");
    Serial.print(pScaled);
    Serial.print(";RMax=");
    Serial.println(getRangeMax(p));
  }

  switch (getRGBRange(p)) {
    case 0: //red
      setRGBColor(&c, pScaled, 0, 0);
      break;
    case 1: //orange
      setRGBColor(&c, pScaled, pScaled*0.66, 0);
      break;
    case 2: //yellow
      setRGBColor(&c, pScaled, pScaled, 0);
      break;
    case 3: //green
      setRGBColor(&c, 0, pScaled, 0);
      break;
    case 4: //blue
      setRGBColor(&c, 0, 0, pScaled);
      break;
    case 5: //indigo
      setRGBColor(&c, pScaled*0.33, 0, pScaled*0.5);
      break;
    case 6: //violet
      setRGBColor(&c, pScaled*0.5, 0, pScaled);
      break;
    case 7:
      setRGBColor(&c, pScaled, pScaled, pScaled);
      break;

  }
  setRGBColor(&c, c.r * bright, c.g * bright, c.b * bright);
  return c;
}

int getRGBRange(int p) { //Pitch in Hz (from Freq conv)
  return floor(p/300);
}

int getRangeMax(int p) { //Pitch in Hz (from Freq conv)
  return (getRGBRange(p)+1)*300;
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

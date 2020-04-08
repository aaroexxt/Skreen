/*
Much thanks to: Amanda Ghassaei
https://www.instructables.com/id/Arduino-Audio-Input/

Extremely modified by Aaron Becker
*/
/*
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
*/

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
#define volumeMax 243

long curPeriod = 0;
int curFreq = 0;

int processedFreq = 0;
int processedVolume = 0;

int avgProcessedFreq = 0;
int avgProcessedVolume = 0;

void setup(){
  Serial.begin(57600);

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

  //if you want to add other things to setup(), do it here

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
  if (curMicros-lastOTM > 33333.0) { //If audio signal is less than 30Hz (about limit of hardware) or greater than 2500Hz (top limit of hardware)
    curFreq = 0; //Default freq to 0
    processedFreq = 0;
    avgProcessedFreq = 0;
  }
}

void loop(){
  long currentMillis = millis();
  if (currentMillis - lastVolUpdateMillis > 10) { //Every 10ms sample audio, this gives 100Hz check rate
    lastVolUpdateMillis = currentMillis;

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
  avgProcessedFreq = (avgProcessedFreq < 0) ? 0 : avgProcessedFreq;

  //Get axes frozen on serial plotter
  /*
  Serial.print(2500);
  Serial.print(",");
  Serial.print(0);
  Serial.print(",");
  */

  Serial.print("Hz:");
  Serial.print(avgProcessedFreq);
  Serial.print(", Vol: ");
  Serial.println(avgProcessedVolume);
}
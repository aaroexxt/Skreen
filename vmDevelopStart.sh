echo "for development only; assists with copying files inside my VM I use for development";

sudo cp /media/sf_Skreen/skreen.js ~/Desktop/Skreen/skreen.js;
sudo cp /media/sf_Skreen/setup.sh ~/Desktop/Skreen/setup.sh;
#sudo rm -r ~/Desktop/Skreen/data;
sudo rm ~/Desktop/Skreen/data/settings.json;
sudo cp -r /media/sf_Skreen/data ~/Desktop/Skreen/data;
sudo cp -r /media/sf_Skreen/data/*.json ~/Desktop/Skreen/data
sudo rm -r ~/Desktop/Skreen/app;
sudo cp -r /media/sf_Skreen/app ~/Desktop/Skreen/app;
sudo rm -r ~/Desktop/Skreen/arduino;
sudo cp -r /media/sf_Skreen/arduino ~/Desktop/Skreen/arduino;
sudo rm -r ~/Desktop/Skreen/drivers;
sudo cp -r /media/sf_Skreen/drivers ~/Desktop/Skreen/drivers;


cd ~/Desktop/Skreen/;
#sudo npm install --unsafe-perm=true --allow-root --save-prod 
sudo node skreen.js;
exit 0;
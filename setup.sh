echo "Skreen setup V1";
echo "------------------"
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


echo "Making directories...";
mkdir -p $cwd/node_modules;

echo "Installing build tools...";
sudo apt-get install -y gcc g++ make cmake git;
echo "Installing curl/wget";
sudo apt-get install -y curl wget;

echo "Installing node/npm...";
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install -y nodejs;
echo "Installing python and pip...";
sudo apt-get install -y python python3 python-pip python3-pip;
echo "Installing libraries speaker...";
sudo apt-get install -y libasound2-dev;
sudo apt-get install -y libalut-dev;
sudo apt-get install -y libopenal1;
sudo apt-get install -y libx11-dev;
sudo apt-get install -y libpng-dev;
sudo apt-get install -y libopenblas-dev;
sudo apt-get install -y libopenal-dev;
sudo apt install -y libavahi-compat-libdnssd-dev;

echo "Setting up system library links...";
sudo ldconfig;


echo "Updating node and npm to correct versions...";
sudo npm cache clean -f #update node
sudo npm install -g n
sudo n 10.15.0
sudo npm install npm@latest -g


echo "Installing node-gyp";
#sudo npm install -g node-gyp;

echo "Installing all important packages from npm";
sudo npm install --unsafe-perm=true --allow-root --save-prod git://github.com/Kolky/nodetunes.git#master
sudo npm install --unsafe-perm=true --allow-root --build-from-source --save-prod serialport;
sudo npm install --unsafe-perm=true --allow-root --save-prod speaker;
sudo npm install --unsafe-perm=true --allow-root --save-prod mp3-duration pcm-volume lame window-size single-line-log colors strip-color brain.js timed-stream node-fetch progress-stream remote-file-size express express-session session-file-store serve-favicon body-parser cors passport passport-local passport-custom bcrypt node-json-db

echo "Done installing packages";


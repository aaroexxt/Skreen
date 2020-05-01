echo "Skreen setup V1";
echo "------------------"

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
echo "Installing libraries...";
sudo apt-get install -y libasound2-dev;
sudo apt-get install -y libalut-dev;
sudo apt-get install -y libopenal1;
sudo apt-get install -y libx11-dev;
sudo apt-get install -y libpng-dev;
sudo apt-get install -y libopenblas-dev;
sudo apt-get install -y libopenal-dev;
sudo apt install -y libavahi-compat-libdnssd-dev;
sudo apt-get install -y build-essential libxi-dev libglu1-mesa-dev libglew-dev pkg-config

echo "Setting up system library links...";
sudo ldconfig;


echo "Updating node and npm to correct versions...";
sudo npm cache clean -f #update node
sudo npm install -g n
sudo n 10.15.0
sudo npm install npm@latest -g
PATH="$PATH" #make sure path variable is correct


echo "Installing node-gyp";
#sudo npm install -g node-gyp;

echo "Installing all important packages from npm";
sudo npm install --unsafe-perm=true --allow-root --save-prod git://github.com/Kolky/nodetunes.git#master
sudo npm install --unsafe-perm=true --allow-root --build-from-source --save-prod serialport;
sudo npm install --unsafe-perm=true --allow-root --save-prod speaker;
sudo npm install --unsafe-perm=true --allow-root --save-prod mp3-duration pcm-volume lame window-size single-line-log colors strip-color brain.js timed-stream node-fetch progress-stream remote-file-size express express-session session-file-store serve-favicon body-parser cors passport passport-local passport-custom bcrypt node-json-db gpu.js

echo "Done installing packages";


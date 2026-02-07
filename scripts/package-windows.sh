#!/bin/bash
set -e

echo "🚀 Building Victoria Laser App for Windows..."
echo ""

# Clean previous release
echo "🧹 Cleaning previous release..."
rm -rf release/
mkdir -p release/laser-app

# Build frontend
echo "📦 Building frontend..."
pnpm --filter web build

# Build backend
echo "⚙️  Building backend..."
pnpm --filter server build

# Copy compiled backend code
echo "📋 Copying backend dist..."
cp -r server/dist release/laser-app/

# Copy compiled frontend code (served as static files)
echo "📋 Copying frontend public..."
cp -r server/public release/laser-app/

# Copy server package.json
echo "📋 Copying package.json..."
cp server/package.json release/laser-app/

# Copy and rename .env.example to .env
echo "📋 Copying .env.example as .env..."
cp server/.env.example release/laser-app/.env

# Copy templates folder
echo "📋 Copying templates..."
cp -r server/templates release/laser-app/

# Copy assets folder
echo "📋 Copying assets..."
cp -r server/assets release/laser-app/

# Create install.bat
echo "📝 Creating install.bat..."
cat > release/laser-app/install.bat << 'EOF'
@echo off
echo Installing Laser App Dependencies...
call npm install --omit=dev
if %errorlevel% neq 0 (
   echo INSTALLATION FAILED!
   pause
   exit /b %errorlevel%
)
echo Installation Complete!
pause
EOF

# Create run.bat
echo "📝 Creating run.bat..."
cat > release/laser-app/run.bat << 'EOF'
@echo off
echo Starting Laser App...
start http://localhost:3001
node dist/src/index.js
pause
EOF

# Create README for Windows deployment
echo "📝 Creating Windows README..."
cat > release/laser-app/README.txt << 'EOF'
Victoria Laser App - Windows Deployment
========================================

INSTALLATION:
1. Extract this folder to a location on the Windows machine (e.g., C:\laser-app\)
2. Install Node.js from https://nodejs.org/ (if not already installed)
3. Double-click "install.bat" to install dependencies
4. Edit the ".env" file if you need to change any settings

RUNNING THE APP:
1. Double-click "run.bat" to start the application
2. The browser will open automatically at http://localhost:3001
3. The app will continue running in the Command Prompt window
4. To stop the app, close the Command Prompt window

CONFIGURATION:
- The ".env" file contains configuration settings
- Templates are in the "templates/" folder
- Assets (images) are in the "assets/" folder
- The database will be created automatically on first run

NOTES:
- Make sure LightBurn is installed and accessible from the command line
- The app will create a "laser.db" SQLite database in this folder
- Do NOT delete the "dist/", "public/", "templates/", or "assets/" folders

For issues, check the console output in the Command Prompt window.
EOF

echo ""
echo "✅ Windows package created successfully!"
echo "📁 Location: release/laser-app/"
echo ""
echo "Next steps:"
echo "1. Copy the 'release/laser-app/' folder to a USB drive or network share"
echo "2. Transfer to the Windows machine"
echo "3. Run 'install.bat' on the Windows machine (one time)"
echo "4. Run 'run.bat' to start the application"

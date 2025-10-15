const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execAsync = promisify(exec);

/**
 * Check for system updates
 */
async function checkSystemUpdates(progressCallback) {
  const platform = os.platform();

  try {
    if (platform === 'darwin') {
      return await checkMacOSUpdates(progressCallback);
    } else if (platform === 'win32') {
      return await checkWindowsUpdates(progressCallback);
    } else {
      return {
        success: false,
        error: 'System updates not supported on this platform'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check for macOS updates
 */
async function checkMacOSUpdates(progressCallback) {
  progressCallback?.({ status: 'Checking for macOS updates...', progress: 30 });

  try {
    const { stdout } = await execAsync('softwareupdate -l');

    // Parse output to check for updates
    const hasUpdates = !stdout.includes('No new software available');

    if (hasUpdates) {
      // Extract update information
      const updates = parseUpdateList(stdout);

      progressCallback?.({ status: 'Updates found', progress: 100 });

      return {
        success: true,
        data: {
          available: true,
          count: updates.length,
          updates: updates,
          message: `${updates.length} update(s) available`
        }
      };
    } else {
      progressCallback?.({ status: 'System is up to date', progress: 100 });

      return {
        success: true,
        data: {
          available: false,
          count: 0,
          updates: [],
          message: 'Your system is up to date'
        }
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check for Windows updates
 */
async function checkWindowsUpdates(progressCallback) {
  progressCallback?.({ status: 'Checking for Windows updates...', progress: 30 });

  try {
    // Use PowerShell to check for updates
    const psCommand = `
      $UpdateSession = New-Object -ComObject Microsoft.Update.Session
      $UpdateSearcher = $UpdateSession.CreateUpdateSearcher()
      $SearchResult = $UpdateSearcher.Search("IsInstalled=0")
      $SearchResult.Updates | Select-Object Title, Description | ConvertTo-Json
    `;

    const { stdout } = await execAsync(`powershell -Command "${psCommand.replace(/\n/g, ' ')}"`);

    const updates = JSON.parse(stdout || '[]');
    const updateArray = Array.isArray(updates) ? updates : [updates];

    progressCallback?.({ status: 'Updates found', progress: 100 });

    return {
      success: true,
      data: {
        available: updateArray.length > 0,
        count: updateArray.length,
        updates: updateArray,
        message: updateArray.length > 0
          ? `${updateArray.length} update(s) available`
          : 'Your system is up to date'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Install system updates
 */
async function installSystemUpdates(progressCallback) {
  const platform = os.platform();

  try {
    if (platform === 'darwin') {
      return await installMacOSUpdates(progressCallback);
    } else if (platform === 'win32') {
      return await installWindowsUpdates(progressCallback);
    } else {
      return {
        success: false,
        error: 'System updates not supported on this platform'
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Install macOS updates
 */
async function installMacOSUpdates(progressCallback) {
  progressCallback?.({ status: 'Installing macOS updates...', progress: 10 });

  try {
    // Install all recommended updates
    progressCallback?.({ status: 'Downloading and installing updates...', progress: 30 });

    const { stdout, stderr } = await execAsync('softwareupdate -i -a', {
      timeout: 600000 // 10 minute timeout
    });

    progressCallback?.({ status: 'Updates installed successfully', progress: 100 });

    // Check if restart is required
    const requiresRestart = stdout.includes('restart') || stderr.includes('restart');

    return {
      success: true,
      data: {
        installed: true,
        requiresRestart,
        message: requiresRestart
          ? 'Updates installed. Please restart your computer to complete the installation.'
          : 'Updates installed successfully'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Install Windows updates
 */
async function installWindowsUpdates(progressCallback) {
  progressCallback?.({ status: 'Installing Windows updates...', progress: 10 });

  try {
    // Use PowerShell to install updates
    const psCommand = `
      $UpdateSession = New-Object -ComObject Microsoft.Update.Session
      $UpdateSearcher = $UpdateSession.CreateUpdateSearcher()
      $SearchResult = $UpdateSearcher.Search("IsInstalled=0")

      if ($SearchResult.Updates.Count -eq 0) {
        Write-Output "No updates to install"
        exit 0
      }

      $UpdatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl
      foreach ($Update in $SearchResult.Updates) {
        $UpdatesToInstall.Add($Update) | Out-Null
      }

      $Installer = $UpdateSession.CreateUpdateInstaller()
      $Installer.Updates = $UpdatesToInstall
      $InstallResult = $Installer.Install()

      $InstallResult.ResultCode
    `;

    progressCallback?.({ status: 'Downloading and installing updates...', progress: 30 });

    const { stdout } = await execAsync(`powershell -Command "${psCommand.replace(/\n/g, ' ')}"`, {
      timeout: 1800000 // 30 minute timeout for Windows updates
    });

    progressCallback?.({ status: 'Updates installed successfully', progress: 100 });

    const resultCode = parseInt(stdout.trim());
    const requiresRestart = resultCode === 3; // 3 = Succeeded with errors (usually means restart required)

    return {
      success: true,
      data: {
        installed: true,
        requiresRestart,
        message: requiresRestart
          ? 'Updates installed. Please restart your computer to complete the installation.'
          : 'Updates installed successfully'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Parse macOS update list
 */
function parseUpdateList(stdout) {
  const lines = stdout.split('\n');
  const updates = [];

  for (const line of lines) {
    // Look for lines that start with * (indicating an update)
    if (line.trim().startsWith('*')) {
      const match = line.match(/\*\s+(.+)/);
      if (match) {
        updates.push({
          title: match[1].trim(),
          description: 'macOS System Update'
        });
      }
    }
  }

  return updates;
}

module.exports = {
  checkSystemUpdates,
  installSystemUpdates
};

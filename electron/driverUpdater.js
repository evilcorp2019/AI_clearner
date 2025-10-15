const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs').promises;
const execPromise = util.promisify(exec);

/**
 * Windows Driver Update Module
 * Uses Windows Update API via PowerShell to check and install driver updates
 *
 * Note: Driver updates are Windows-only. macOS handles driver updates automatically
 * through system updates and doesn't provide a user-facing driver update mechanism.
 */

// Windows Update Result Codes
const RESULT_CODES = {
  0: 'Not Started',
  1: 'In Progress',
  2: 'Succeeded',
  3: 'Succeeded with Errors',
  4: 'Failed',
  5: 'Aborted'
};

async function checkDriverUpdates(progressCallback) {
  if (process.platform !== 'win32') {
    throw new Error('Driver updates are only available on Windows');
  }

  if (progressCallback) {
    progressCallback({ status: 'Scanning for outdated drivers...' });
  }

  try {
    // PowerShell script to check for driver updates using Windows Update
    const psScript = `
      $Session = New-Object -ComObject Microsoft.Update.Session
      $Searcher = $Session.CreateUpdateSearcher()
      $Searcher.Online = $true

      Write-Host "Searching for driver updates..."
      $SearchResult = $Searcher.Search("Type='Driver' and IsInstalled=0")

      $Updates = @()
      foreach ($Update in $SearchResult.Updates) {
        $UpdateInfo = @{
          Title = $Update.Title
          Description = $Update.Description
          DriverClass = $Update.DriverClass
          DriverManufacturer = $Update.DriverManufacturer
          DriverModel = $Update.DriverModel
          DriverProvider = $Update.DriverProvider
          DriverVerDate = $Update.DriverVerDate
          IsDownloaded = $Update.IsDownloaded
          RebootRequired = $Update.RebootRequired
          UpdateID = $Update.Identity.UpdateID
        }
        $Updates += $UpdateInfo
      }

      $Updates | ConvertTo-Json
    `;

    const { stdout, stderr } = await execPromise(
      `powershell -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`,
      { timeout: 60000 }
    );

    if (stderr && !stderr.includes('Searching')) {
      console.error('PowerShell stderr:', stderr);
    }

    let drivers = [];
    try {
      const jsonOutput = stdout.trim();
      if (jsonOutput && jsonOutput !== 'null') {
        const parsed = JSON.parse(jsonOutput);
        drivers = Array.isArray(parsed) ? parsed : [parsed];
      }
    } catch (parseError) {
      console.error('Failed to parse driver list:', parseError);
    }

    return {
      success: true,
      driversFound: drivers.length,
      drivers: drivers,
      message: `Found ${drivers.length} driver update(s) available`
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      drivers: []
    };
  }
}

async function updateDrivers(driverIds, progressCallback) {
  if (process.platform !== 'win32') {
    throw new Error('Driver updates are only available on Windows');
  }

  if (!driverIds || driverIds.length === 0) {
    return {
      success: false,
      error: 'No driver IDs provided',
      data: { updated: [], failed: [], rebootRequired: false }
    };
  }

  const results = {
    updated: [],
    failed: [],
    rebootRequired: false
  };

  try {
    if (progressCallback) {
      progressCallback({
        status: 'Creating system restore point...',
        current: 0,
        total: driverIds.length + 2
      });
    }

    // Create a system restore point before updating drivers
    try {
      await createRestorePoint('Before Driver Updates');
      console.log('[DRIVER_UPDATER] System restore point created');
    } catch (restoreError) {
      console.warn('[DRIVER_UPDATER] Failed to create restore point:', restoreError.message);
      // Continue anyway - restore point is optional
    }

    if (progressCallback) {
      progressCallback({
        status: 'Preparing driver updates...',
        current: 1,
        total: driverIds.length + 2
      });
    }

    // Write PowerShell script to a temporary file to avoid escaping issues
    const scriptPath = path.join(process.env.TEMP || '/tmp', `driver-update-${Date.now()}.ps1`);

    // Build the driver IDs filter for PowerShell
    const driverIdsFilter = driverIds.map(id => `"${id}"`).join(',');

    // PowerShell script to install ONLY selected driver updates
    const psScript = `
# Script to install selected driver updates
$TargetDriverIDs = @(${driverIdsFilter})
$ErrorActionPreference = "Stop"

try {
    Write-Host "=== Starting Driver Update Process ==="
    Write-Host "Target Drivers: $($TargetDriverIDs.Count)"

    $Session = New-Object -ComObject Microsoft.Update.Session
    $Searcher = $Session.CreateUpdateSearcher()
    $SearchResult = $Searcher.Search("Type='Driver' and IsInstalled=0")

    Write-Host "Found $($SearchResult.Updates.Count) available driver updates"

    $UpdatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl
    $SelectedDrivers = @()

    # Filter to install ONLY the selected drivers
    foreach ($Update in $SearchResult.Updates) {
        $UpdateID = $Update.Identity.UpdateID
        if ($TargetDriverIDs -contains $UpdateID) {
            $UpdatesToInstall.Add($Update) | Out-Null
            $SelectedDrivers += $Update.Title
            Write-Host "Selected: $($Update.Title)"
        }
    }

    if ($UpdatesToInstall.Count -eq 0) {
        Write-Host "ERROR: None of the selected drivers were found in available updates"
        exit 4
    }

    Write-Host "=== Downloading $($UpdatesToInstall.Count) driver update(s) ==="
    $Downloader = $Session.CreateUpdateDownloader()
    $Downloader.Updates = $UpdatesToInstall
    $DownloadResult = $Downloader.Download()

    Write-Host "Download Result Code: $($DownloadResult.ResultCode)"

    if ($DownloadResult.ResultCode -ne 2) {
        Write-Host "ERROR: Download failed with code $($DownloadResult.ResultCode)"
        exit 4
    }

    Write-Host "=== Installing driver updates ==="
    $Installer = $Session.CreateUpdateInstaller()
    $Installer.Updates = $UpdatesToInstall
    $InstallResult = $Installer.Install()

    Write-Host "Installation Result Code: $($InstallResult.ResultCode)"
    Write-Host "Reboot Required: $($InstallResult.RebootRequired)"

    # Output structured data
    $Result = @{
        ResultCode = $InstallResult.ResultCode
        ResultText = switch ($InstallResult.ResultCode) {
            0 { "Not Started" }
            1 { "In Progress" }
            2 { "Succeeded" }
            3 { "Succeeded with Errors" }
            4 { "Failed" }
            5 { "Aborted" }
            default { "Unknown" }
        }
        RebootRequired = $InstallResult.RebootRequired
        UpdatedDrivers = $SelectedDrivers
        UpdateCount = $UpdatesToInstall.Count
    }

    $Result | ConvertTo-Json -Compress

    exit $InstallResult.ResultCode

} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    exit 4
}
`;

    // Write the script to file
    await fs.writeFile(scriptPath, psScript, 'utf8');
    console.log(`[DRIVER_UPDATER] PowerShell script written to: ${scriptPath}`);

    if (progressCallback) {
      progressCallback({
        status: 'Installing driver updates (this may take 10-30 minutes)...',
        current: 2,
        total: driverIds.length + 2
      });
    }

    // Execute the PowerShell script with elevation
    // Note: This will trigger a UAC prompt. The app should ideally run as admin.
    const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;

    console.log('[DRIVER_UPDATER] Executing driver installation...');
    const { stdout, stderr } = await execPromise(command, {
      timeout: 1800000, // 30 minutes timeout for large driver downloads
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer for output
    });

    console.log('[DRIVER_UPDATER] Installation output:', stdout);

    if (stderr) {
      console.warn('[DRIVER_UPDATER] Installation stderr:', stderr);
    }

    // Clean up the temporary script file
    try {
      await fs.unlink(scriptPath);
    } catch (unlinkError) {
      console.warn('[DRIVER_UPDATER] Failed to delete temp script:', unlinkError.message);
    }

    // Parse the result
    let installResult;
    try {
      const jsonMatch = stdout.match(/\{.*"ResultCode".*\}/);
      if (jsonMatch) {
        installResult = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.warn('[DRIVER_UPDATER] Failed to parse result JSON:', parseError.message);
    }

    // Determine success based on result code
    const resultCode = installResult?.ResultCode ?? 4;
    const success = resultCode === 2 || resultCode === 3; // 2 = Success, 3 = Success with errors

    if (success) {
      results.updated = driverIds;
      results.rebootRequired = installResult?.RebootRequired || stdout.includes('Reboot Required: True');
    } else {
      results.failed = driverIds;
    }

    if (progressCallback) {
      progressCallback({
        status: success ? 'Driver updates completed' : 'Driver update failed',
        current: driverIds.length + 2,
        total: driverIds.length + 2
      });
    }

    const resultText = RESULT_CODES[resultCode] || 'Unknown';

    return {
      success,
      data: results,
      message: success
        ? `Successfully updated ${results.updated.length} driver(s). ${results.rebootRequired ? 'Please restart your computer to complete the installation.' : ''}`
        : `Driver update failed: ${resultText}. ${stderr || 'Please check if Windows Update is enabled and you have administrator privileges.'}`,
      resultCode,
      resultText
    };

  } catch (error) {
    console.error('[DRIVER_UPDATER] Error:', error);
    results.failed = driverIds;

    let errorMessage = error.message;

    // Provide helpful error messages
    if (error.message.includes('timeout')) {
      errorMessage = 'Driver installation timed out. Large drivers may take longer. Please try again or install drivers individually.';
    } else if (error.message.includes('access') || error.message.includes('permission')) {
      errorMessage = 'Permission denied. Please run the application as Administrator to install driver updates.';
    } else if (error.message.includes('Windows Update')) {
      errorMessage = 'Windows Update service is not available. Please enable it in Windows Services.';
    }

    return {
      success: false,
      error: errorMessage,
      data: results
    };
  }
}

/**
 * Create a system restore point before making changes
 */
async function createRestorePoint(description) {
  if (process.platform !== 'win32') {
    throw new Error('System restore points are only available on Windows');
  }

  const psScript = `
    try {
      Checkpoint-Computer -Description "${description}" -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
      Write-Host "SUCCESS"
    } catch {
      Write-Host "FAILED: $($_.Exception.Message)"
      exit 1
    }
  `;

  try {
    const { stdout } = await execPromise(
      `powershell -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`,
      { timeout: 30000 }
    );

    if (!stdout.includes('SUCCESS')) {
      throw new Error('Failed to create restore point');
    }
  } catch (error) {
    throw new Error(`Could not create restore point: ${error.message}`);
  }
}

async function checkWindowsUpdate() {
  if (process.platform !== 'win32') {
    return { available: false, reason: 'Not Windows' };
  }

  try {
    // Check if Windows Update service is running
    const { stdout } = await execPromise(
      'sc query wuauserv',
      { timeout: 5000 }
    );

    const isRunning = stdout.includes('RUNNING');

    return {
      available: isRunning,
      reason: isRunning ? 'Windows Update service is running' : 'Windows Update service is not running'
    };
  } catch (error) {
    return {
      available: false,
      reason: 'Unable to check Windows Update service: ' + error.message
    };
  }
}

module.exports = {
  checkDriverUpdates,
  updateDrivers,
  checkWindowsUpdate
};

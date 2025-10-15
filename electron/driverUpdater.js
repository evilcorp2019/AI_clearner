const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Windows Driver Update Module
 * Uses Windows Update API via PowerShell to check and install driver updates
 */

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

  const results = {
    updated: [],
    failed: [],
    rebootRequired: false
  };

  try {
    if (progressCallback) {
      progressCallback({
        status: 'Installing driver updates...',
        current: 0,
        total: driverIds.length
      });
    }

    // PowerShell script to install driver updates
    const psScript = `
      $Session = New-Object -ComObject Microsoft.Update.Session
      $Searcher = $Session.CreateUpdateSearcher()
      $SearchResult = $Searcher.Search("Type='Driver' and IsInstalled=0")

      $UpdatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl

      foreach ($Update in $SearchResult.Updates) {
        $UpdatesToInstall.Add($Update) | Out-Null
      }

      if ($UpdatesToInstall.Count -eq 0) {
        Write-Host "No updates to install"
        exit 0
      }

      $Downloader = $Session.CreateUpdateDownloader()
      $Downloader.Updates = $UpdatesToInstall

      Write-Host "Downloading updates..."
      $DownloadResult = $Downloader.Download()

      if ($DownloadResult.ResultCode -eq 2) {
        Write-Host "Download completed"

        $Installer = $Session.CreateUpdateInstaller()
        $Installer.Updates = $UpdatesToInstall

        Write-Host "Installing updates..."
        $InstallResult = $Installer.Install()

        Write-Host "Installation Result Code: $($InstallResult.ResultCode)"
        Write-Host "Reboot Required: $($InstallResult.RebootRequired)"

        exit $InstallResult.ResultCode
      } else {
        Write-Host "Download failed with code: $($DownloadResult.ResultCode)"
        exit 1
      }
    `;

    const { stdout, stderr } = await execPromise(
      `powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -Command \\"${psScript.replace(/"/g, '\\"')}\\"' -Wait"`,
      { timeout: 300000 } // 5 minutes timeout
    );

    if (progressCallback) {
      progressCallback({
        status: 'Driver updates completed',
        current: driverIds.length,
        total: driverIds.length
      });
    }

    results.updated = driverIds;
    results.rebootRequired = stdout.includes('Reboot Required: True');

    return {
      success: true,
      data: results,
      message: `Successfully updated ${results.updated.length} driver(s). ${results.rebootRequired ? 'Reboot required.' : ''}`
    };

  } catch (error) {
    results.failed = driverIds;
    return {
      success: false,
      error: error.message,
      data: results
    };
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

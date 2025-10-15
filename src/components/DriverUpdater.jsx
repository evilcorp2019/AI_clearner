import React, { useState, useEffect } from 'react';
import './DriverUpdater.css';

function DriverUpdater({ systemInfo }) {
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [checkProgress, setCheckProgress] = useState(null);
  const [updateProgress, setUpdateProgress] = useState(null);
  const [windowsUpdateAvailable, setWindowsUpdateAvailable] = useState(null);

  const isWindows = systemInfo?.platform === 'win32';

  useEffect(() => {
    if (isWindows) {
      checkWindowsUpdateService();
    }

    window.electronAPI.onDriverCheckProgress((data) => {
      setCheckProgress(data);
    });

    window.electronAPI.onDriverUpdateProgress((data) => {
      setUpdateProgress(data);
    });

    return () => {
      window.electronAPI.removeDriverCheckProgressListener();
      window.electronAPI.removeDriverUpdateProgressListener();
    };
  }, [isWindows]);

  const checkWindowsUpdateService = async () => {
    try {
      const result = await window.electronAPI.checkWindowsUpdate();
      if (result.success) {
        setWindowsUpdateAvailable(result.data);
      }
    } catch (error) {
      console.error('Failed to check Windows Update:', error);
    }
  };

  const handleCheckDrivers = async () => {
    setIsChecking(true);
    setCheckProgress(null);
    setDrivers([]);

    try {
      const result = await window.electronAPI.checkDriverUpdates();
      if (result.success) {
        setDrivers(result.drivers);
        if (result.driversFound === 0) {
          alert('All drivers are up to date!');
        }
      } else {
        alert('Failed to check drivers: ' + result.error);
      }
    } catch (error) {
      alert('Error checking drivers: ' + error.message);
    } finally {
      setIsChecking(false);
      setCheckProgress(null);
    }
  };

  const handleUpdateDrivers = async () => {
    if (drivers.length === 0) {
      alert('No drivers to update');
      return;
    }

    const confirmed = confirm(
      `Update ${drivers.length} driver(s)? This requires administrator privileges and may require a reboot.`
    );

    if (!confirmed) return;

    setIsUpdating(true);
    setUpdateProgress(null);

    try {
      const driverIds = drivers.map(d => d.UpdateID);
      const result = await window.electronAPI.updateDrivers(driverIds);

      if (result.success) {
        const message = result.message || 'Drivers updated successfully!';
        alert(message);

        if (result.data?.rebootRequired) {
          const reboot = confirm('A system reboot is required. Reboot now?');
          if (reboot) {
            // Could trigger reboot here
            alert('Please reboot your system manually.');
          }
        }

        // Clear drivers list after successful update
        setDrivers([]);
      } else {
        alert('Failed to update drivers: ' + result.error);
      }
    } catch (error) {
      alert('Error updating drivers: ' + error.message);
    } finally {
      setIsUpdating(false);
      setUpdateProgress(null);
    }
  };

  if (!isWindows) {
    return (
      <div className="driver-updater-card disabled">
        <h2>Driver Updates</h2>
        <p className="unavailable-message">
          Driver updates are only available on Windows systems.
        </p>
      </div>
    );
  }

  if (windowsUpdateAvailable && !windowsUpdateAvailable.available) {
    return (
      <div className="driver-updater-card disabled">
        <h2>Driver Updates</h2>
        <p className="unavailable-message">
          Windows Update service is not available: {windowsUpdateAvailable.reason}
        </p>
      </div>
    );
  }

  return (
    <div className="driver-updater-card">
      <h2>Driver Updates</h2>
      <p className="driver-description">
        Check for and install outdated device drivers using Windows Update
      </p>

      <button
        className="check-drivers-button"
        onClick={handleCheckDrivers}
        disabled={isChecking || isUpdating}
      >
        {isChecking ? (
          <>
            <span className="spinner"></span>
            Checking...
          </>
        ) : (
          'Check for Driver Updates'
        )}
      </button>

      {checkProgress && (
        <div className="progress-info">
          <div className="progress-text">{checkProgress.status}</div>
        </div>
      )}

      {drivers.length > 0 && (
        <div className="drivers-section">
          <div className="drivers-header">
            <h3>Available Updates ({drivers.length})</h3>
          </div>

          <div className="drivers-list">
            {drivers.map((driver, index) => (
              <div key={index} className="driver-item">
                <div className="driver-info">
                  <div className="driver-title">{driver.Title}</div>
                  <div className="driver-meta">
                    {driver.DriverManufacturer && (
                      <span className="driver-manufacturer">
                        {driver.DriverManufacturer}
                      </span>
                    )}
                    {driver.DriverClass && (
                      <span className="driver-class">{driver.DriverClass}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            className="update-drivers-button"
            onClick={handleUpdateDrivers}
            disabled={isUpdating}
          >
            {isUpdating ? (
              <>
                <span className="spinner"></span>
                Updating...
              </>
            ) : (
              'Update All Drivers'
            )}
          </button>

          {updateProgress && (
            <div className="progress-info">
              <div className="progress-text">{updateProgress.status}</div>
              {updateProgress.current !== undefined && (
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${(updateProgress.current / updateProgress.total) * 100}%`
                    }}
                  ></div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DriverUpdater;

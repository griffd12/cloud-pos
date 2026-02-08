import { useState, useEffect } from "react";
import { Download, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { isElectron, type UpdateStatus } from "@/lib/electron";
import { Button } from "@/components/ui/button";

export function UpdateStatusBanner() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isElectron()) return;

    const api = window.electronAPI;
    if (!api?.onUpdateStatus) return;

    const unsub = api.onUpdateStatus((status) => {
      setUpdateStatus(status);
      if (status.status === 'ready' || status.status === 'downloading') {
        setDismissed(false);
      }
    });

    api.updater?.getStatus().then(setUpdateStatus).catch(() => {});

    return unsub;
  }, []);

  if (!updateStatus || dismissed) return null;

  if (updateStatus.status === 'downloading') {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-[9998] bg-blue-600 text-white text-center py-2 px-4 text-xs font-medium flex items-center justify-center gap-2"
        data-testid="banner-update-downloading"
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>Downloading update v{updateStatus.availableVersion}... {updateStatus.downloadProgress}%</span>
        <div className="w-24 h-1.5 bg-blue-400 rounded-full overflow-hidden ml-2">
          <div
            className="h-full bg-white rounded-full transition-all duration-300"
            style={{ width: `${updateStatus.downloadProgress}%` }}
          />
        </div>
      </div>
    );
  }

  if (updateStatus.status === 'ready') {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-[9998] bg-emerald-600 text-white text-center py-2 px-4 text-xs font-medium flex items-center justify-center gap-3"
        data-testid="banner-update-ready"
      >
        <CheckCircle className="w-3.5 h-3.5" />
        <span>Update v{updateStatus.availableVersion} ready to install</span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs border-white/40 text-white bg-transparent"
          onClick={() => window.electronAPI?.updater.install()}
          data-testid="button-install-update"
        >
          <Download className="w-3 h-3 mr-1" />
          Restart & Update
        </Button>
        <button
          className="text-white/60 text-xs underline ml-2"
          onClick={() => setDismissed(true)}
          data-testid="button-dismiss-update"
        >
          Later
        </button>
      </div>
    );
  }

  if (updateStatus.status === 'error' && updateStatus.error) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-[9998] bg-amber-600 text-white text-center py-1.5 px-4 text-xs font-medium flex items-center justify-center gap-2"
        data-testid="banner-update-error"
      >
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Update check failed: {updateStatus.error}</span>
        <button
          className="text-white/60 text-xs underline ml-2"
          onClick={() => setDismissed(true)}
          data-testid="button-dismiss-update-error"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return null;
}

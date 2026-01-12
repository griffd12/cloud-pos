/**
 * React Hook for Real-time Device Status Updates
 * 
 * Connects to WebSocket for live device status updates
 * and provides automatic reconnection.
 */

import { useState, useEffect, useCallback, useRef } from "react";

type DeviceStatus = 'online' | 'offline' | 'degraded' | 'error' | 'unknown';
type ConnectionMode = 'green' | 'yellow' | 'orange' | 'red';

interface DeviceUpdate {
  type: 'device_status' | 'mode_change' | 'alert' | 'heartbeat';
  deviceId?: string;
  deviceType?: string;
  status?: DeviceStatus;
  mode?: ConnectionMode;
  propertyId?: string;
  message?: string;
  timestamp: string;
}

interface UseDeviceStatusOptions {
  propertyId?: string;
  enterpriseId?: string;
  onUpdate?: (update: DeviceUpdate) => void;
  onModeChange?: (mode: ConnectionMode, propertyId: string) => void;
  onAlert?: (alert: any) => void;
}

export function useDeviceStatus(options: UseDeviceStatusOptions = {}) {
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<DeviceUpdate | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    // Don't connect if no propertyId or enterpriseId
    if (!options.propertyId && !options.enterpriseId) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log('Device status WebSocket connected');
        
        // Subscribe to updates
        if (options.propertyId) {
          ws.send(JSON.stringify({
            type: 'subscribe_device_status',
            propertyId: options.propertyId,
          }));
        }
        if (options.enterpriseId) {
          ws.send(JSON.stringify({
            type: 'subscribe_enterprise_status',
            enterpriseId: options.enterpriseId,
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const update: DeviceUpdate = JSON.parse(event.data);
          setLastUpdate(update);
          
          options.onUpdate?.(update);
          
          if (update.type === 'mode_change' && update.mode && update.propertyId) {
            options.onModeChange?.(update.mode, update.propertyId);
          }
          
          if (update.type === 'alert') {
            options.onAlert?.(update);
          }
        } catch (e) {
          console.error('Failed to parse device status update:', e);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        console.log('Device status WebSocket disconnected, reconnecting...');
        
        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error('Device status WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      
      // Retry connection
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    }
  }, [options.propertyId, options.enterpriseId, options.onUpdate, options.onModeChange, options.onAlert]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnected(false);
  }, []);

  const sendHeartbeat = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'workstation_heartbeat',
        propertyId: options.propertyId,
        timestamp: new Date().toISOString(),
      }));
    }
  }, [options.propertyId]);

  useEffect(() => {
    connect();
    
    // Send heartbeat every 15 seconds
    const heartbeatInterval = setInterval(sendHeartbeat, 15000);
    
    return () => {
      clearInterval(heartbeatInterval);
      disconnect();
    };
  }, [connect, disconnect, sendHeartbeat]);

  return {
    connected,
    lastUpdate,
    reconnect: connect,
    disconnect,
  };
}

// Hook for workstation heartbeat at FOH level
export function useWorkstationHeartbeat(workstationId: string | undefined, propertyId: string | undefined) {
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);

  useEffect(() => {
    if (!workstationId || !propertyId) return;

    const sendHeartbeat = async () => {
      try {
        await fetch('/api/system-status/workstation/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workstationId,
            connectionMode: 'green', // Will be updated by api-client
            pendingSyncCount: 0,
            checkCount: 0,
          }),
        });
        setLastHeartbeat(new Date());
      } catch (error) {
        console.warn('Failed to send workstation heartbeat:', error);
      }
    };

    // Send immediately and then every 30 seconds
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000);

    return () => clearInterval(interval);
  }, [workstationId, propertyId]);

  return { lastHeartbeat };
}

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, X, Check, AlertCircle, Info, Calendar } from 'lucide-react';
import api from '@/utils/api';

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data);
    } catch (error) {
      console.error('Failed to load notifications');
    }
  };

  useEffect(() => {
    loadNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = async (notificationId) => {
    try {
      await api.put(`/notifications/${notificationId}/read`);
      setNotifications(notifications.map(n => 
        n.notification_id === notificationId ? { ...n, read: true } : n
      ));
    } catch (error) {
      console.error('Failed to mark notification as read');
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(notifications.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Failed to mark all as read');
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'session_cancelled':
        return <X className="text-red-500" size={18} />;
      case 'slot_available':
        return <Calendar className="text-green-500" size={18} />;
      case 'booking_restricted':
        return <AlertCircle className="text-orange-500" size={18} />;
      case 'booking_unrestricted':
        return <Check className="text-green-500" size={18} />;
      case 'announcement':
        return <Info className="text-blue-500" size={18} />;
      case 'attendance_pending':
        return <AlertCircle className="text-amber-500" size={18} />;
      default:
        return <Bell className="text-gray-500" size={18} />;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'border-r-4 border-red-500';
      case 'important':
        return 'border-r-4 border-orange-500';
      default:
        return '';
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="relative px-2"
        onClick={() => setShowDropdown(!showDropdown)}
        data-testid="notification-bell"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {showDropdown && (
        <>
          {/* Mobile: Full screen overlay */}
          <div className="fixed inset-0 z-50 sm:hidden bg-white overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white">
              <h3 className="font-bold text-primary font-amiri text-xl">الإشعارات</h3>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllAsRead}
                    className="text-sm"
                  >
                    قراءة الكل
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDropdown(false)}
                >
                  <X size={20} />
                </Button>
              </div>
            </div>

            {notifications.length > 0 ? (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <div
                    key={notification.notification_id}
                    className={`p-4 active:bg-gray-100 ${
                      !notification.read ? 'bg-blue-50' : ''
                    } ${getPriorityColor(notification.priority)}`}
                    onClick={() => markAsRead(notification.notification_id)}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {getIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-plex font-bold text-base text-gray-900">
                          {notification.title}
                        </p>
                        <p className="font-plex text-sm text-gray-600 mt-1">
                          {notification.message}
                        </p>
                        <p className="font-plex text-xs text-gray-400 mt-2">
                          {new Date(notification.created_at).toLocaleString('en-US', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <Bell className="mx-auto text-gray-300 mb-3" size={48} />
                <p className="font-plex text-gray-500">لا توجد إشعارات</p>
              </div>
            )}
          </div>

          {/* Desktop: Dropdown */}
          <div className="hidden sm:block absolute left-0 top-12 w-80 max-h-96 overflow-y-auto bg-white rounded-lg shadow-xl border z-50">
            <div className="p-3 border-b flex justify-between items-center sticky top-0 bg-white">
              <h3 className="font-bold text-primary font-amiri">الإشعارات</h3>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="text-xs"
                >
                  قراءة الكل
                </Button>
              )}
            </div>

            {notifications.length > 0 ? (
              <div className="divide-y">
                {notifications.slice(0, 10).map((notification) => (
                  <div
                    key={notification.notification_id}
                    className={`p-3 hover:bg-gray-50 cursor-pointer ${
                      !notification.read ? 'bg-blue-50' : ''
                    } ${getPriorityColor(notification.priority)}`}
                    onClick={() => markAsRead(notification.notification_id)}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {getIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-plex font-bold text-sm text-gray-900 truncate">
                          {notification.title}
                        </p>
                        <p className="font-plex text-xs text-gray-600 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="font-plex text-xs text-gray-400 mt-1">
                          {new Date(notification.created_at).toLocaleString('en-US', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })}
                        </p>
                      </div>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center">
                <Bell className="mx-auto text-gray-300 mb-2" size={32} />
                <p className="font-plex text-sm text-gray-500">لا توجد إشعارات</p>
              </div>
            )}
          </div>

          {/* Desktop backdrop */}
          <div 
            className="hidden sm:block fixed inset-0 z-40" 
            onClick={() => setShowDropdown(false)}
          />
        </>
      )}
    </div>
  );
};

export default NotificationBell;

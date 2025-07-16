import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { 
  User, 
  Settings, 
  LogOut, 
  Crown, 
  Camera, 
  ChevronDown,
  Bell,
  CreditCard,
  Shield
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LogoutDialog } from "@/components/ui/logout-dialog";
import { useUser } from "@/contexts/UserContext";
import { useAuth } from "@/contexts/AuthContext";

interface UserProfileDropdownProps {
  className?: string;
}

export default function UserProfileDropdown({ className = "" }: UserProfileDropdownProps) {
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { user, updateProfile } = useUser();
  const { logout } = useAuth();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && user) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          try {
            await updateProfile({ avatar: result });
          } catch (error) {
            console.error('Failed to update avatar:', error);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = () => {
    setShowLogoutDialog(true);
    setIsOpen(false);
  };

  const confirmLogout = () => {
    logout();
    setShowLogoutDialog(false);
    setLocation('/login');
  };

  const navigateTo = (path: string) => {
    setLocation(path);
    setIsOpen(false);
  };

  const getInitials = (firstName: string = '', lastName: string = '') => {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'U';
  };

  const getUserName = () => {
    if (!user) return 'Loading...';
    return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User';
  };

  const getPlanColor = () => {
    return 'bg-gradient-to-r from-blue-500 to-green-500';
  };

  if (!user) {
    return null; // Don't render anything if no user
  }

  return (
    <div className={`relative ${className}`}>
      <motion.button
        onClick={() => {
          if (isMobile) {
            navigateTo('/profile');
          } else if (className.includes('w-full')) {
            setIsOpen(!isOpen);
          } else {
            setIsOpen(!isOpen);
          }
        }}
        className="flex items-center space-x-3 p-2 rounded-xl glassmorphism hover:bg-white/10 transition-all duration-200 w-full"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Avatar className="w-8 h-8 ring-2 ring-blue-500/30">
          <AvatarImage src={user.avatar || undefined} alt={getUserName()} />
          <AvatarFallback className="bg-gradient-to-r from-blue-500 to-green-500 text-white text-sm font-semibold">
            {getInitials(user.firstName || '', user.lastName || '')}
          </AvatarFallback>
        </Avatar>
        <div className="text-left flex-1">
          <div className="text-sm font-medium text-slate-900 dark:text-white sm:block hidden">{getUserName()}</div>
          <div className="text-sm font-medium text-slate-900 dark:text-white sm:hidden block">Profile</div>
          <div className="text-xs text-slate-600 dark:text-slate-400 sm:block hidden">Pro Plan</div>
          <div className="text-xs text-slate-600 dark:text-slate-400 sm:hidden block">Settings & Account</div>
        </div>
        {!isMobile && className.includes('w-full') ? (
          <ChevronDown className={`w-4 h-4 text-slate-600 dark:text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} />
        ) : isMobile ? (
          <div className="text-xs text-slate-400">→</div>
        ) : (
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} />
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && !isMobile && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Dropdown */}
            <motion.div
              className="absolute top-full mt-2 glassmorphism-strong rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50 
                         w-80 max-w-[calc(100vw-1rem)] 
                         right-0 sm:right-0 
                         xs:right-2 xs:w-72
                         max-sm:right-2 max-sm:w-[calc(100vw-2rem)]"
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              {/* User Info Section */}
              <div className="p-4 bg-gradient-to-r from-blue-500/10 to-green-500/10">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <Avatar className="w-12 h-12 ring-2 ring-blue-500/30">
                      <AvatarImage src={user.avatar || undefined} alt={getUserName()} />
                      <AvatarFallback className="bg-gradient-to-r from-blue-500 to-green-500 text-white font-semibold">
                        {getInitials(user.firstName || '', user.lastName || '')}
                      </AvatarFallback>
                    </Avatar>
                    <label className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-600 transition-colors">
                      <Camera className="w-3 h-3 text-white" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-white">{getUserName()}</div>
                    <div className="text-sm text-slate-400">{user.email || 'No email set'}</div>
                    <Badge className={`mt-1 text-xs ${getPlanColor()} text-white border-0`}>
                      <Crown className="w-3 h-3 mr-1" />
                      Pro Plan
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator className="bg-white/10" />

              {/* User Details */}
              <div className="p-4">
                <div className="text-sm font-medium text-white mb-2">Account Details</div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">Occupation</span>
                    <span className="text-white">{user.occupation || 'Not set'}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">Location</span>
                    <span className="text-white">{user.location || 'Not set'}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">Theme</span>
                    <span className="text-white capitalize">{user.theme || 'dark'}</span>
                  </div>
                </div>
              </div>

              <Separator className="bg-white/10" />

              {/* Menu Items */}
              <div className="p-2">
                <motion.button
                  onClick={() => navigateTo('/profile')}
                  className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <User className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <span className="text-slate-900 dark:text-white">Profile Settings</span>
                </motion.button>

                <motion.button
                  onClick={() => navigateTo('/billing')}
                  className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <CreditCard className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <span className="text-slate-900 dark:text-white">Billing & Subscription</span>
                </motion.button>

                <motion.button
                  onClick={() => navigateTo('/notifications')}
                  className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Bell className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <span className="text-slate-900 dark:text-white">Notifications</span>
                  <div className="ml-auto">
                    <div className={`w-2 h-2 rounded-full ${user.emailNotifications ? 'bg-green-400' : 'bg-gray-400'}`} />
                  </div>
                </motion.button>

                <motion.button
                  onClick={() => navigateTo('/privacy')}
                  className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Shield className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <span className="text-slate-900 dark:text-white">Privacy & Security</span>
                </motion.button>

                <motion.button
                  onClick={() => navigateTo('/settings')}
                  className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-white/10 transition-colors text-left"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Settings className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <span className="text-slate-900 dark:text-white">General Settings</span>
                </motion.button>

                <Separator className="bg-slate-300 dark:bg-white/10 my-2" />

                <motion.button
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-red-500/20 transition-colors text-left group"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <LogOut className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 group-hover:text-red-300">Log Out</span>
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
      {/* Logout Confirmation Dialog */}
      <LogoutDialog 
        open={showLogoutDialog}
        onOpenChange={setShowLogoutDialog}
        onConfirm={confirmLogout}
      />
    </div>
  );
}
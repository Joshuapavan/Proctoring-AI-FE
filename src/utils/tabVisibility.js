let tabSwitchCount = 0;
const TAB_SWITCH_LIMIT = 3;

export const handleTabVisibility = (callback) => {
  const handleVisibilityChange = async () => {
    if (document.hidden) {
      tabSwitchCount++;
      console.log('Tab switch count:', tabSwitchCount);
      if (tabSwitchCount >= TAB_SWITCH_LIMIT) {
        try {
          const userId = localStorage.getItem('userId');
          await callback('tab-switch', tabSwitchCount);
        } catch (error) {
          console.error('Error in tab switch violation:', error);
        }
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
};

export const incrementTabSwitchCount = () => {
  tabSwitchCount++;
  return tabSwitchCount;
};

export const getTabSwitchCount = () => tabSwitchCount;
export const resetTabSwitchCount = () => { tabSwitchCount = 0; };

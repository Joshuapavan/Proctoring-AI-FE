let tabSwitchCount = 0;
const TAB_SWITCH_LIMIT = 3;

export const handleTabVisibility = (callback) => {
  const handleVisibilityChange = () => {
    if (document.hidden) {
      tabSwitchCount++;
      if (tabSwitchCount >= TAB_SWITCH_LIMIT) {
        callback();
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
};

export const getTabSwitchCount = () => tabSwitchCount;
export const resetTabSwitchCount = () => { tabSwitchCount = 0; };

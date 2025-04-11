let copyPasteCount = 0;
const COPY_PASTE_LIMIT = 3;

export const incrementCopyPasteCount = () => {
    copyPasteCount++;
    return copyPasteCount >= COPY_PASTE_LIMIT;
};

export const getCopyPasteCount = () => copyPasteCount;
export const resetCopyPasteCount = () => { copyPasteCount = 0; };

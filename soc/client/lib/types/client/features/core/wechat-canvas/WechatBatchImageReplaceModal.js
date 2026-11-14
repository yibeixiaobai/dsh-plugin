import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
import { X, UploadCloud, ArrowUp, ArrowDown, Trash2, Images, ArrowRight, Info, Check, } from 'lucide-react';
import css from './WechatBatchImageReplaceModal.module.css';
export function WechatBatchImageReplaceModal({ isOpen, onClose, originalImageUrls, nodeLabel = '图文卡片', onConfirmReplace, }) {
    const [selectedImages, setSelectedImages] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);
    useEffect(() => {
        if (isOpen) {
            setSelectedImages([]);
            setIsDragging(false);
        }
    }, [isOpen]);
    useEffect(() => {
        if (!isOpen)
            return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);
    if (!isOpen)
        return null;
    const handleFiles = (files) => {
        const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (fileArray.length === 0)
            return;
        const newItems = [];
        let loadedCount = 0;
        fileArray.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const url = e.target?.result;
                if (url) {
                    newItems[index] = {
                        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${index}`,
                        name: file.name,
                        url,
                        file,
                    };
                }
                loadedCount++;
                if (loadedCount === fileArray.length) {
                    const orderedClean = newItems.filter(Boolean);
                    setSelectedImages(prev => [...prev, ...orderedClean]);
                }
            };
            reader.readAsDataURL(file);
        });
    };
    const handleFileInputChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
            e.target.value = '';
        }
    };
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };
    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    };
    const handleMoveUp = (index) => {
        if (index === 0)
            return;
        setSelectedImages((prev) => {
            const updated = [...prev];
            const temp = updated[index - 1];
            updated[index - 1] = updated[index];
            updated[index] = temp;
            return updated;
        });
    };
    const handleMoveDown = (index) => {
        if (index === selectedImages.length - 1)
            return;
        setSelectedImages((prev) => {
            const updated = [...prev];
            const temp = updated[index + 1];
            updated[index + 1] = updated[index];
            updated[index] = temp;
            return updated;
        });
    };
    const handleRemove = (index) => {
        setSelectedImages(prev => prev.filter((_, i) => i !== index));
    };
    const handleConfirm = () => {
        if (selectedImages.length === 0)
            return;
        const orderedUrls = selectedImages.map(item => item.url);
        onConfirmReplace(orderedUrls);
        onClose();
    };
    return (_jsx("div", { className: css.backdrop, onClick: onClose, children: _jsxs("div", { className: css.modalContainer, onClick: e => e.stopPropagation(), children: [_jsxs("div", { className: css.header, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("div", { style: {
                                        width: 32,
                                        height: 32,
                                        borderRadius: 8,
                                        background: 'rgba(16, 185, 129, 0.12)',
                                        color: '#059669',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }, children: _jsx(Images, { size: 16 }) }), _jsxs("div", { children: [_jsx("h3", { className: css.headerTitle, children: "\u6279\u91CF\u66FF\u6362\u5361\u7247\u56FE\u7247" }), _jsxs("p", { className: css.headerSubtitle, children: ["\u5F53\u524D\u7EC4\u4EF6\uFF1A", nodeLabel, " \u00B7 \u539F\u6709 ", originalImageUrls.length, " \u4E2A\u56FE\u7247\u69FD\u4F4D"] })] })] }), _jsx("button", { type: "button", onClick: onClose, className: css.closeBtn, "aria-label": "\u5173\u95ED\u7A97\u53E3", children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: css.bodyArea, children: [_jsxs("div", { onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop, onClick: () => fileInputRef.current?.click(), className: `${css.dropZone} ${isDragging ? css.dropZoneHover : ''}`, children: [_jsx("input", { type: "file", ref: fileInputRef, onChange: handleFileInputChange, multiple: true, accept: "image/*", style: { display: 'none' } }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }, children: [_jsx("div", { style: {
                                                width: 40,
                                                height: 40,
                                                borderRadius: '50%',
                                                background: 'rgba(0,0,0,0.05)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#6b7280'
                                            }, children: _jsx(UploadCloud, { size: 20 }) }), _jsx("div", { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #111827)' }, children: "\u70B9\u51FB\u9009\u62E9\u591A\u5F20\u56FE\u7247\uFF0C\u6216\u76F4\u63A5\u62D6\u62FD\u56FE\u7247\u81F3\u6B64\u5904" }), _jsx("p", { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #9ca3af)', margin: 0 }, children: "\u7CFB\u7EDF\u5C06\u4E25\u683C\u6309\u60A8\u52FE\u9009/\u653E\u5165\u7684\u987A\u5E8F\u4F9D\u6B21\u66FF\u6362\u5230\u56FE\u6587\u5361\u7247\u4E2D\uFF08\u652F\u6301 JPG / PNG / WebP\uFF09" })] })] }), selectedImages.length > 0 ? (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsxs("div", { style: {
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: 'var(--dsw-alias-label-primary, #111827)',
                                        padding: '0 4px'
                                    }, children: [_jsx("span", { children: "\u66FF\u6362\u6620\u5C04\u9884\u89C8\uFF08\u652F\u6301\u70B9\u51FB\u7BAD\u5934\u5FAE\u8C03\u987A\u5E8F\uFF09" }), _jsxs("span", { style: { color: 'var(--dsw-alias-label-tertiary, #9ca3af)', fontWeight: 400 }, children: ["\u5DF2\u9009 ", selectedImages.length, " \u5F20\u56FE\u7247"] })] }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 8 }, children: selectedImages.map((item, idx) => {
                                        const targetSlot = originalImageUrls[idx];
                                        return (_jsxs("div", { className: css.imageItem, children: [_jsxs("span", { style: {
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        color: '#10b981',
                                                        width: 22,
                                                        textAlign: 'center'
                                                    }, children: ["#", idx + 1] }), _jsx("img", { src: item.url, alt: item.name, className: css.thumbImg }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: {
                                                                fontSize: 12,
                                                                fontWeight: 500,
                                                                color: 'var(--dsw-alias-label-primary, #111827)',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap'
                                                            }, children: item.name }), targetSlot ? (_jsxs("div", { style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 4,
                                                                fontSize: 10,
                                                                color: '#10b981',
                                                                marginTop: 2
                                                            }, children: [_jsx(Check, { size: 11 }), _jsxs("span", { children: ["\u6620\u5C04\u539F\u5361\u7247\u56FE #", idx + 1] })] })) : (_jsxs("div", { style: {
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 4,
                                                                fontSize: 10,
                                                                color: '#d97706',
                                                                marginTop: 2
                                                            }, children: [_jsx(ArrowRight, { size: 11 }), _jsx("span", { children: "\u8D85\u989D\u65B0\u589E\u81F3\u5361\u7247\u672B\u5C3E" })] }))] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [_jsx("button", { type: "button", disabled: idx === 0, onClick: () => handleMoveUp(idx), className: css.iconBtn, title: "\u4E0A\u79FB", children: _jsx(ArrowUp, { size: 12 }) }), _jsx("button", { type: "button", disabled: idx === selectedImages.length - 1, onClick: () => handleMoveDown(idx), className: css.iconBtn, title: "\u4E0B\u79FB", children: _jsx(ArrowDown, { size: 12 }) }), _jsx("button", { type: "button", onClick: () => handleRemove(idx), className: css.iconBtn, style: { color: '#ef4444' }, title: "\u79FB\u9664", children: _jsx(Trash2, { size: 12 }) })] })] }, item.id));
                                    }) })] })) : (_jsxs("div", { style: {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '10px 14px',
                                borderRadius: 8,
                                background: 'rgba(14, 165, 233, 0.08)',
                                border: '1px solid rgba(14, 165, 233, 0.15)',
                                fontSize: 11,
                                color: '#0284c7'
                            }, children: [_jsx(Info, { size: 14, style: { flexShrink: 0 } }), _jsx("span", { children: "\u5C1A\u672A\u9009\u62E9\u66FF\u6362\u56FE\u7247\u3002\u60A8\u53EF\u4EE5\u4E00\u6B21\u6027\u9009\u4E2D\u591A\u5F20\u56FE\u7247\uFF0C\u7CFB\u7EDF\u5C06\u4E25\u683C\u6309\u60A8\u7684\u9009\u62E9\u987A\u5E8F\u539F\u4F4D\u6620\u5C04\u3002" })] }))] }), _jsxs("div", { className: css.footer, children: [_jsxs("div", { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #9ca3af)' }, children: ["\u539F\u56FE\u5171 ", originalImageUrls.length, " \u5F20 \u00B7 \u62DF\u66FF\u6362 ", selectedImages.length, " \u5F20"] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("button", { type: "button", onClick: onClose, style: {
                                        padding: '6px 14px',
                                        borderRadius: 8,
                                        border: '1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12))',
                                        background: 'var(--dsw-alias-bg-base, #ffffff)',
                                        color: 'var(--dsw-alias-label-primary, #111827)',
                                        cursor: 'pointer',
                                        fontSize: 12
                                    }, children: "\u53D6\u6D88" }), _jsxs("button", { type: "button", disabled: selectedImages.length === 0, onClick: handleConfirm, className: css.confirmBtn, children: ["\u786E\u8BA4\u6309\u5E8F\u66FF\u6362 (", selectedImages.length, ")"] })] })] })] }) }));
}
//# sourceMappingURL=WechatBatchImageReplaceModal.js.map
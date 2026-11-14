function showNotice(title, opts, type = 'info') {
    if (typeof window !== 'undefined') {
        const msg = opts?.description ? `${title}: ${opts.description}` : title;
        if (type === 'error')
            console.error(`[Toast] ${msg}`);
        else
            console.log(`[Toast] ${msg}`);
    }
}
export const toast = Object.assign((title, opts) => showNotice(title, opts, 'info'), {
    success: (title, opts) => showNotice(title, opts, 'success'),
    error: (title, opts) => showNotice(title, opts, 'error'),
    info: (title, opts) => showNotice(title, opts, 'info'),
});
//# sourceMappingURL=toast.js.map
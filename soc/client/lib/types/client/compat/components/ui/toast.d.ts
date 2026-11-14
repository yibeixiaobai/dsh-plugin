export interface ToastOptions {
    description?: string;
    duration?: number;
}
export declare const toast: ((title: string, opts?: ToastOptions) => void) & {
    success: (title: string, opts?: ToastOptions) => void;
    error: (title: string, opts?: ToastOptions) => void;
    info: (title: string, opts?: ToastOptions) => void;
};
//# sourceMappingURL=toast.d.ts.map
export type GenericBlockType = 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'blockquote' | 'li' | 'img' | 'brand_top' | 'brand_bot' | 'hr' | 'raw';
export interface GenericSectionBlock {
    id: string;
    type: GenericBlockType;
    text?: string;
    src?: string;
    alt?: string;
    rawText?: string;
}
//# sourceMappingURL=genericCanvasTypes.d.ts.map
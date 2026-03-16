import { describe, it, expect } from 'vitest';
import { processFile, MAX_FILE_SIZE, getFilesFromDataTransfer } from '../../utils/attachmentUtils';

describe('attachmentUtils', () => {
    describe('processFile', () => {
        it('should resolve with Attachment object for valid image', async () => {
            const file = new File(['dummy'], 'test.png', { type: 'image/png' });
            // Mock FileReader
            const originalFileReader = global.FileReader;
            // @ts-ignore
            global.FileReader = class {
                onload: ((e: any) => void) | null = null;
                onerror: (() => void) | null = null;
                readAsDataURL() {
                    if (this.onload) {
                        this.onload({ target: { result: 'base64-data' } });
                    }
                }
            };

            const result = await processFile(file);
            expect(result.name).toBe('test.png');
            expect(result.type).toBe('image');
            expect(result.url).toBe('base64-data');

            global.FileReader = originalFileReader;
        });

        it('should reject if file is too large', async () => {
            const largeFile = {
                name: 'large.png',
                type: 'image/png',
                size: MAX_FILE_SIZE + 1
            } as File;

            await expect(processFile(largeFile)).rejects.toThrow(/文件大小超过限制/);
        });

        it('should reject unsupported file types', async () => {
            const file = new File(['dummy'], 'test.txt', { type: 'text/plain' });
            await expect(processFile(file)).rejects.toThrow(/不支持的文件类型/);
        });
    });

    describe('getFilesFromDataTransfer', () => {
        it('should extract files from DataTransferItemList', () => {
            const file = new File([''], 'test.png', { type: 'image/png' });
            const mockItems = [
                { kind: 'file', getAsFile: () => file },
                { kind: 'string', getAsFile: () => null }
            ] as unknown as DataTransferItemList;
            // mock length property
            Object.defineProperty(mockItems, 'length', { value: 2 });

            const result = getFilesFromDataTransfer(mockItems);
            expect(result).toHaveLength(1);
            expect(result[0]).toBe(file);
        });
    });
});

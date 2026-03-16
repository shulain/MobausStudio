import React, { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Modal, Button } from '../../common';
import type { ImportOptions } from '../../../types';
import { useI18n } from '../../../i18n';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (file: File, options: ImportOptions) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
    isOpen,
    onClose,
    onImport,
}) => {
    const { t } = useI18n();

    const [file, setFile] = useState<File | null>(null);
    const [options, setOptions] = useState<ImportOptions>({
        merge: true,
        backup: true,
    });
    const [isDragging, setIsDragging] = useState(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.name.endsWith('.json')) {
            setFile(droppedFile);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
        }
    };

    const handleImport = () => {
        if (file) {
            onImport(file, options);
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t.importModal.title} size="md">
            <div className="space-y-6">
                {/* 文件上传区域 */}
                <div
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-[10px] p-8 text-center transition-colors ${isDragging
                            ? 'border-purple-400 bg-purple-50'
                            : 'border-gray-300 hover:border-purple-400'
                        }`}
                >
                    {file ? (
                        <div>
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Download className="w-8 h-8 text-green-600" />
                            </div>
                            <h3 className="font-semibold text-gray-800 mb-2">{file.name}</h3>
                            <p className="text-sm text-gray-500">
                                {(file.size / 1024).toFixed(2)} KB
                            </p>
                            <button
                                onClick={() => setFile(null)}
                                className="mt-3 text-sm text-red-600 hover:text-red-700"
                            >
                                {t.importModal.removeFile}
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Upload className="w-8 h-8 text-purple-600" />
                            </div>
                            <h3 className="font-semibold text-gray-800 mb-2">
                                {t.importModal.dropFileHere}
                            </h3>
                            <p className="text-sm text-gray-500 mb-4">{t.importModal.orClickToSelect}</p>
                            <label className="px-4 py-2 bg-purple-50 text-purple-600 rounded-[10px] text-sm font-medium hover:bg-purple-100 cursor-pointer">
                                {t.importModal.selectFile}
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    )}
                </div>

                {/* 导入选项 */}
                <div className="space-y-3">
                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-[10px] cursor-pointer hover:bg-gray-50">
                        <input
                            type="checkbox"
                            checked={options.merge}
                            onChange={(e) =>
                                setOptions((prev) => ({ ...prev, merge: e.target.checked }))
                            }
                            className="w-4 h-4 accent-purple-500"
                        />
                        <div>
                            <div className="font-medium text-sm text-gray-800">
                                {t.importModal.mergeExisting}
                            </div>
                            <div className="text-xs text-gray-500">
                                {t.importModal.mergeExistingDesc}
                            </div>
                        </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-[10px] cursor-pointer hover:bg-gray-50">
                        <input
                            type="checkbox"
                            checked={options.backup}
                            onChange={(e) =>
                                setOptions((prev) => ({ ...prev, backup: e.target.checked }))
                            }
                            className="w-4 h-4 accent-purple-500"
                        />
                        <div>
                            <div className="font-medium text-sm text-gray-800">
                                {t.importModal.backupBefore}
                            </div>
                            <div className="text-xs text-gray-500">
                                {t.importModal.backupBeforeDesc}
                            </div>
                        </div>
                    </label>
                </div>

                <div className="flex gap-3 pt-4">
                    <Button variant="secondary" onClick={onClose} className="flex-1">
                        {t.common.cancel}
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={!file}
                        className="flex-1"
                    >
                        {t.importModal.startImport}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default ImportModal;

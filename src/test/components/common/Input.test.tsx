import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input, SearchInput, Textarea, Select, Toggle } from '../../../components/common/Input';

describe('Input', () => {
    it('should render with value', () => {
        render(<Input value="test value" onChange={() => { }} />);
        expect(screen.getByDisplayValue('test value')).toBeDefined();
    });

    it('should call onChange when typing', () => {
        const handleChange = vi.fn();
        render(<Input value="" onChange={handleChange} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new value' } });
        expect(handleChange).toHaveBeenCalledWith('new value');
    });

    it('should render placeholder', () => {
        render(<Input value="" onChange={() => { }} placeholder="Enter text..." />);
        expect(screen.getByPlaceholderText('Enter text...')).toBeDefined();
    });

    it('should be disabled when disabled prop is true', () => {
        render(<Input value="" onChange={() => { }} disabled />);
        expect(screen.getByRole('textbox')).toBeDisabled();
    });
});

describe('SearchInput', () => {
    it('should render with search icon', () => {
        const { container } = render(<SearchInput value="" onChange={() => { }} />);
        expect(container.querySelector('svg')).toBeDefined();
    });

    it('should call onChange when typing', () => {
        const handleChange = vi.fn();
        render(<SearchInput value="" onChange={handleChange} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'search' } });
        expect(handleChange).toHaveBeenCalledWith('search');
    });
});

describe('Textarea', () => {
    it('should render with rows', () => {
        render(<Textarea value="" onChange={() => { }} rows={5} />);
        expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5');
    });

    it('should call onChange when typing', () => {
        const handleChange = vi.fn();
        render(<Textarea value="" onChange={handleChange} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'text' } });
        expect(handleChange).toHaveBeenCalledWith('text');
    });
});

/**
 * Select 组件测试 (v3.6.5 重构为自定义下拉组件)
 *
 * 测试用例对应文档: docs/components/common.md
 * - SEL-01: 渲染选项列表
 * - SEL-02: 选择选项
 * - SEL-03: 已连接标识
 * - SEL-04: 禁用选项
 * - SEL-05 ~ SEL-08: 键盘导航和交互
 */
describe('Select (v3.6.5 自定义下拉组件)', () => {
    const options = [
        { value: 'a', label: 'Option A' },
        { value: 'b', label: 'Option B' },
        { value: 'c', label: 'Option C ● 已连接' },
    ];

    /**
     * SEL-01: 渲染选项列表
     */
    it('SEL-01: 点击后应显示所有选项', () => {
        render(<Select value="a" onChange={() => { }} options={options} />);

        // 点击触发按钮展开下拉框
        const trigger = screen.getByRole('button');
        fireEvent.click(trigger);

        // 验证选项显示（使用 getAllByText 因为触发按钮和下拉列表都有文本）
        expect(screen.getAllByText('Option A').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('Option B')).toBeDefined();
        // 已连接标识会被解析，所以只检查名称部分
        expect(screen.getByText('Option C')).toBeDefined();
    });

    /**
     * SEL-02: 选择选项
     */
    it('SEL-02: 点击选项应触发 onChange 并关闭下拉框', () => {
        const handleChange = vi.fn();
        render(<Select value="a" onChange={handleChange} options={options} />);

        // 展开下拉框
        const trigger = screen.getByRole('button');
        fireEvent.click(trigger);

        // 点击选项 B
        fireEvent.click(screen.getByText('Option B'));

        // 验证 onChange 被调用
        expect(handleChange).toHaveBeenCalledWith('b');
    });

    /**
     * SEL-03: 已连接标识
     */
    it('SEL-03: 应正确显示已连接标识徽章', () => {
        render(<Select value="c" onChange={() => { }} options={options} />);

        // 触发按钮应显示已连接徽章
        expect(screen.getByText('已连接')).toBeDefined();
    });

    /**
     * SEL-04: 禁用选项
     */
    it('SEL-04: 禁用选项不应触发 onChange', () => {
        const handleChange = vi.fn();
        const optionsWithDisabled = [
            { value: 'a', label: 'Option A' },
            { value: 'b', label: 'Option B', disabled: true },
        ];
        render(<Select value="a" onChange={handleChange} options={optionsWithDisabled} />);

        // 展开下拉框
        fireEvent.click(screen.getByRole('button'));

        // 点击禁用选项
        fireEvent.click(screen.getByText('Option B'));

        // onChange 不应被调用
        expect(handleChange).not.toHaveBeenCalled();
    });

    /**
     * SEL-06: ESC 关闭
     */
    it('SEL-06: 按 ESC 键应关闭下拉框', () => {
        render(<Select value="a" onChange={() => { }} options={options} />);

        // 展开下拉框
        const trigger = screen.getByRole('button');
        fireEvent.click(trigger);

        // 验证下拉框已展开
        expect(screen.getByText('Option B')).toBeDefined();

        // 按 ESC 键
        fireEvent.keyDown(trigger, { key: 'Escape' });

        // 下拉框应关闭（选项不再可见）
        expect(screen.queryByText('Option B')).toBeNull();
    });

    /**
     * SEL-08: 选中状态
     */
    it('SEL-08: 当前选中项应显示选中样式', () => {
        render(<Select value="a" onChange={() => { }} options={options} />);

        // 触发按钮应显示当前选中的标签
        expect(screen.getByText('Option A')).toBeDefined();
    });

    /**
     * 测试禁用状态
     */
    it('禁用状态下不应展开下拉框', () => {
        render(<Select value="a" onChange={() => { }} options={options} disabled />);

        // 点击触发按钮
        const trigger = screen.getByRole('button');
        fireEvent.click(trigger);

        // 下拉框不应展开
        expect(screen.queryByText('Option B')).toBeNull();
    });

    /**
     * 测试占位符
     */
    it('无选中值时应显示占位符', () => {
        render(<Select value="" onChange={() => { }} options={options} placeholder="请选择..." />);

        expect(screen.getByText('请选择...')).toBeDefined();
    });
});

describe('Toggle', () => {
    it('should render checked state', () => {
        render(<Toggle checked={true} onChange={() => { }} />);
        expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('should call onChange when clicked', () => {
        const handleChange = vi.fn();
        render(<Toggle checked={false} onChange={handleChange} />);
        fireEvent.click(screen.getByRole('checkbox'));
        expect(handleChange).toHaveBeenCalledWith(true);
    });
});

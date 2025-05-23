/**
 * Cursor rule:
 * 1. Only `showSearch` enabled
 * 2. Only `open` is `true`
 * 3. When typing, set `open` to `true` which hit rule of 2
 *
 * Accessibility:
 * - https://www.w3.org/TR/wai-aria-practices/examples/combobox/aria1.1pattern/listbox-combo.html
 */

import KeyCode from '@rc-component/util/lib/KeyCode';
import type { ScrollTo } from 'rc-virtual-list/lib/List';
import * as React from 'react';
import { useRef } from 'react';
import type { CustomTagProps, DisplayValueType, Mode, RenderNode } from '../BaseSelect';
import useLock from '../hooks/useLock';
import { isValidateOpenKey } from '../utils/keyUtil';
import MultipleSelector from './MultipleSelector';
import SingleSelector from './SingleSelector';
import classNames from 'classnames';

export interface InnerSelectorProps {
  prefixCls: string;
  id: string;
  mode: Mode;
  title?: string;

  inputRef: React.Ref<HTMLInputElement | HTMLTextAreaElement>;
  placeholder?: React.ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  values: DisplayValueType[];
  showSearch?: boolean;
  searchValue: string;
  autoClearSearchValue?: boolean;
  activeDescendantId?: string;
  open: boolean;
  tabIndex?: number;
  maxLength?: number;

  onInputKeyDown: React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onInputMouseDown: React.MouseEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onInputChange: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onInputPaste: React.ClipboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onInputCompositionStart: React.CompositionEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onInputCompositionEnd: React.CompositionEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onInputBlur: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
}

export interface RefSelectorProps {
  focus: (options?: FocusOptions) => void;
  blur: () => void;
  scrollTo?: ScrollTo;
  nativeElement: HTMLDivElement;
}

export interface SelectorProps {
  prefixClassName: string;
  prefixStyle: React.CSSProperties;
  id: string;
  prefixCls: string;
  showSearch?: boolean;
  open: boolean;
  /** Display in the Selector value, it's not same as `value` prop */
  values: DisplayValueType[];
  mode: Mode;
  searchValue: string;
  activeValue: string;
  autoClearSearchValue: boolean;
  inputElement: JSX.Element;
  maxLength?: number;

  autoFocus?: boolean;
  activeDescendantId?: string;
  tabIndex?: number;
  disabled?: boolean;
  placeholder?: React.ReactNode;
  removeIcon?: RenderNode;
  prefix?: React.ReactNode;

  // Tags
  maxTagCount?: number | 'responsive';
  maxTagTextLength?: number;
  maxTagPlaceholder?: React.ReactNode | ((omittedValues: DisplayValueType[]) => React.ReactNode);
  tagRender?: (props: CustomTagProps) => React.ReactElement;

  /** Check if `tokenSeparators` contains `\n` or `\r\n` */
  tokenWithEnter?: boolean;

  // Motion
  choiceTransitionName?: string;

  onToggleOpen: (open?: boolean) => void;
  /** `onSearch` returns go next step boolean to check if need do toggle open */
  onSearch: (searchText: string, fromTyping: boolean, isCompositing: boolean) => boolean;
  onSearchSubmit?: (searchText: string) => void;
  onRemove: (value: DisplayValueType) => void;
  onInputKeyDown?: React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  // on inner input blur
  onInputBlur?: () => void;
}

const Selector: React.ForwardRefRenderFunction<RefSelectorProps, SelectorProps> = (props, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const compositionStatusRef = useRef<boolean>(false);

  const {
    prefixClassName,
    prefixStyle,
    prefixCls,
    open,
    mode,
    showSearch,
    tokenWithEnter,
    disabled,
    prefix,

    autoClearSearchValue,

    onSearch,
    onSearchSubmit,
    onToggleOpen,
    onInputKeyDown,
    onInputBlur,
  } = props;

  // ======================= Ref =======================
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useImperativeHandle(ref, () => ({
    focus: (options) => {
      inputRef.current.focus(options);
    },
    blur: () => {
      inputRef.current.blur();
    },
    nativeElement: containerRef.current,
  }));

  // ====================== Input ======================
  const [getInputMouseDown, setInputMouseDown] = useLock(0);

  const onInternalInputKeyDown: React.KeyboardEventHandler<
    HTMLInputElement | HTMLTextAreaElement
  > = (event) => {
    const { which } = event;

    // Compatible with multiple lines in TextArea
    const isTextAreaElement = inputRef.current instanceof HTMLTextAreaElement;
    if (!isTextAreaElement && open && (which === KeyCode.UP || which === KeyCode.DOWN)) {
      event.preventDefault();
    }

    if (onInputKeyDown) {
      onInputKeyDown(event);
    }

    if (which === KeyCode.ENTER && mode === 'tags' && !compositionStatusRef.current && !open) {
      // When menu isn't open, OptionList won't trigger a value change
      // So when enter is pressed, the tag's input value should be emitted here to let selector know
      onSearchSubmit?.((event.target as HTMLInputElement).value);
    }
    // Move within the text box
    if (
      isTextAreaElement &&
      !open &&
      ~[KeyCode.UP, KeyCode.DOWN, KeyCode.LEFT, KeyCode.RIGHT].indexOf(which)
    ) {
      return;
    }
    if (isValidateOpenKey(which)) {
      onToggleOpen(true);
    }
  };

  /**
   * We can not use `findDOMNode` sine it will get warning,
   * have to use timer to check if is input element.
   */
  const onInternalInputMouseDown: React.MouseEventHandler<HTMLInputElement> = () => {
    setInputMouseDown(true);
  };

  // When paste come, ignore next onChange
  const pastedTextRef = useRef<string>(null);

  const triggerOnSearch = (value: string) => {
    if (onSearch(value, true, compositionStatusRef.current) !== false) {
      onToggleOpen(true);
    }
  };

  const onInputCompositionStart = () => {
    compositionStatusRef.current = true;
  };

  const onInputCompositionEnd: React.CompositionEventHandler<HTMLInputElement> = (e) => {
    compositionStatusRef.current = false;

    // Trigger search again to support `tokenSeparators` with typewriting
    if (mode !== 'combobox') {
      triggerOnSearch((e.target as HTMLInputElement).value);
    }
  };

  const onInputChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    let {
      target: { value },
    } = event;

    // Pasted text should replace back to origin content
    if (tokenWithEnter && pastedTextRef.current && /[\r\n]/.test(pastedTextRef.current)) {
      // CRLF will be treated as a single space for input element
      const replacedText = pastedTextRef.current
        .replace(/[\r\n]+$/, '')
        .replace(/\r\n/g, ' ')
        .replace(/[\r\n]/g, ' ');
      value = value.replace(replacedText, pastedTextRef.current);
    }

    pastedTextRef.current = null;

    triggerOnSearch(value);
  };

  const onInputPaste: React.ClipboardEventHandler = (e) => {
    const { clipboardData } = e;
    const value = clipboardData?.getData('text');
    pastedTextRef.current = value || '';
  };

  const onClick = ({ target }) => {
    if (target !== inputRef.current) {
      // Should focus input if click the selector
      const isIE = (document.body.style as any).msTouchAction !== undefined;
      if (isIE) {
        setTimeout(() => {
          inputRef.current.focus();
        });
      } else {
        inputRef.current.focus();
      }
    }
  };

  const onMouseDown: React.MouseEventHandler<HTMLElement> = (event) => {
    const inputMouseDown = getInputMouseDown();

    // when mode is combobox and it is disabled, don't prevent default behavior
    // https://github.com/ant-design/ant-design/issues/37320
    // https://github.com/ant-design/ant-design/issues/48281
    if (
      event.target !== inputRef.current &&
      !inputMouseDown &&
      !(mode === 'combobox' && disabled)
    ) {
      event.preventDefault();
    }

    if ((mode !== 'combobox' && (!showSearch || !inputMouseDown)) || !open) {
      if (open && autoClearSearchValue !== false) {
        onSearch('', true, false);
      }
      onToggleOpen();
    }
  };

  // ================= Inner Selector ==================
  const sharedProps = {
    inputRef,
    onInputKeyDown: onInternalInputKeyDown,
    onInputMouseDown: onInternalInputMouseDown,
    onInputChange,
    onInputPaste,
    onInputCompositionStart,
    onInputCompositionEnd,
    onInputBlur,
  };

  const selectNode =
    mode === 'multiple' || mode === 'tags' ? (
      <MultipleSelector {...props} {...sharedProps} />
    ) : (
      <SingleSelector {...props} {...sharedProps} />
    );

  return (
    <div
      ref={containerRef}
      className={`${prefixCls}-selector`}
      onClick={onClick}
      onMouseDown={onMouseDown}
    >
      {prefix && (
        <div className={classNames(`${prefixCls}-prefix`, prefixClassName)} style={prefixStyle}>
          {prefix}
        </div>
      )}
      {selectNode}
    </div>
  );
};

const ForwardSelector = React.forwardRef<RefSelectorProps, SelectorProps>(Selector);

if (process.env.NODE_ENV !== 'production') {
  ForwardSelector.displayName = 'Selector';
}

export default ForwardSelector;

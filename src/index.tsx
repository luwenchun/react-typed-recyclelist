import React from 'react';
import NAMap from './NAMap';
import { delayCall, getMinIndex, getMax } from './util';
import CellWrapper from './CellWraper';

export type HeaderFooterProps = {
  onHeightChange: (height: number) => void;
  style: React.CSSProperties;
};

export type CellWrapperProps = {
  height: number;
  width: number;
  top: number;
  data: any;
  index: number;
  uniqueKey?: string;
  left: number;
  cellExtraProps?: any;
};

export type CellProps<T, K = any> = {
  style: React.CSSProperties;
  data: T;
  index: number;
  store: any;
  uniqueKey?: string;
  cellExtraProps?: K;
};

export type CellDatas<T> = {
  height: number;
  data: T;
  uniqueKey?: string;
  Component: React.ComponentType<CellProps<T>>;
}[];

export type RecyclerListProps = {
  Header?: React.ComponentType<HeaderFooterProps>;
  Footer?: React.ComponentType<HeaderFooterProps>;
  cellData: CellDatas<any>;
  height: number;
  width: number;
  columnGap?: number; // 列与列之间的间歇
  leftGap?: number; // 列与容器左边的间歇
  rightGap?: number; // 列与容器右边的间歇
  columns?: number; // 瀑布了列的数量
  style?: React.CSSProperties;
  className?: string;
  renderAccuary?: number;
  scrollComputeThrottle?: number;
  onScroll?: (scrollTop: number, event: React.UIEvent<HTMLDivElement>) => void;
  defaultScrollTop?: number;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  onCellShow?: (index: number) => void;
  onCellHide?: (index: number) => void;
  onHeaderShow?: () => void;
  onHeaderHide?: () => void;
  onFooterShow?: () => void;
  onFooterHide?: () => void;
  forceRelayoutKey?: string;
  cellExtraProps?: any;
};

type Layout = {
  height: number;
  top: number;
  left: number;
  width: number;
  type: React.ComponentType<CellProps<any>>;
};

export type RenderInfo = { i: number; dom: number };

type State = {
  headerHeight: number;
  footerHeight: number;
  cellData: CellDatas<any>;
  layouts: Layout[];
  renderCurrent: number[];
  contentHeight: number;
  width: number;
  headerStyle: React.CSSProperties;
  footerStyle: React.CSSProperties;
  columnHeights: number[];
  lastProps: RecyclerListProps | null;
};

const scrollStyle: React.CSSProperties = {
  WebkitOverflowScrolling: 'touch',
  overflowX: 'hidden',
  overflowY: 'scroll',
};

const headerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
};

const footerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
};

class RecyclerList extends React.Component<RecyclerListProps, State> {
  static getUniqueKey(props: RecyclerListProps | null) {
    if (!props) return '';
    const { forceRelayoutKey, columns, leftGap, rightGap, columnGap, width, height } = props;
    return '' + forceRelayoutKey + columns + leftGap + rightGap + columnGap + width + height;
  }

  static computedRenderCellLayouts(props: RecyclerListProps, state: State) {
    const shouldRelayout =
      RecyclerList.getUniqueKey(state.lastProps) === RecyclerList.getUniqueKey(props);

    const lastLength = state.cellData.length;
    const columnHeights = state.columnHeights;
    const { columns = 1, leftGap = 0, rightGap = 0, columnGap = 0, width } = props;
    const itemWidth = (width - leftGap - rightGap - (columns - 1) * columnGap) / columns;
    const layouts: Layout[] = [];
    let totalHeight = 0;

    const startIndex = shouldRelayout ? 0 : lastLength;

    for (let i = startIndex, len = props.cellData.length; i < len; i++) {
      const { height, Component } = props.cellData[i];
      const shouldInsertColumnIndex = getMinIndex(columnHeights);
      const currentHeight = columnHeights[shouldInsertColumnIndex];

      columnHeights[shouldInsertColumnIndex] = currentHeight + height;

      layouts.push({
        height,
        top: currentHeight,
        type: Component,
        width: itemWidth,
        left: leftGap + shouldInsertColumnIndex * (columnGap + itemWidth),
      });
      totalHeight += height;
    }

    return {
      layouts,
      contentHeight: getMax(columnHeights),
      lastProps: props,
    };
  }

  static getDerivedStateFromProps(props: RecyclerListProps, state: State) {
    const { width } = props;
    const isCellDataEqual =
      props.cellData === state.cellData && props.cellData.length === state.cellData.length;
    const isKeyEqual =
      RecyclerList.getUniqueKey(state.lastProps) === RecyclerList.getUniqueKey(props);
    if (isCellDataEqual && isKeyEqual) {
      return null;
    } else {
      const newState = {};
      if (!isCellDataEqual) {
        Object.assign(newState, {
          ...RecyclerList.computedRenderCellLayouts(props, state),
          cellData: props.cellData,
        });
      }

      if (!isKeyEqual) {
        Object.assign(newState, {
          width: width,
          headerStyle: { ...headerStyle, width },
          footerStyle: { ...footerStyle, width },
        });
      }

      return newState;
    }
  }

  private current: RenderInfo[] = [];
  private topRemoveMap: NAMap = new NAMap();
  private bottomRemoveMap: NAMap = new NAMap();

  private forceRelayoutKey?: string;

  state: State = {
    // @ts-ignore
    headerHeight: this.props.Header?.initHeight || 0,
    // @ts-ignore
    footerHeight: this.props.Footer?.initHeight || 0,
    cellData: [],
    layouts: [],
    renderCurrent: [],
    contentHeight: 0,
    width: 0,
    headerStyle: {},
    footerStyle: {},
    columnHeights: Array(this.props.columns).fill(0),
    lastProps: null,
  };

  lastScrollTop: number = NaN;

  container = React.createRef<HTMLDivElement>();

  private headerShow: boolean = false;
  private footerShow: boolean = false;
  private cellFirstShowIndex: number = NaN;
  private cellLastShowIndex: number = NaN;

  private handleHeaderHeightChange = (height: number) => {
    this.setState({ headerHeight: height });
  };

  private handleFooterHeightChange = (height: number) => {
    this.setState({ footerHeight: height });
  };

  private getRenderListFromEmpty(start: number, end: number) {
    const { layouts } = this.state;
    const len = layouts.length;

    let startIndex: number | undefined = undefined,
      endIndex: number | undefined = undefined;
    for (let i = 0; i < len; i++) {
      const cell = layouts[i];

      if (startIndex === undefined) {
        if (cell.top + cell.height >= start) {
          startIndex = i;
        }
      } else {
        if (cell.top >= end) {
          endIndex = i - 1;
          break;
        }
      }
    }
    if (endIndex === undefined) {
      endIndex = len - 1;
    }

    const newCurrent: RenderInfo[] = [];
    const newRenderCurrent: number[] = [];
    if (startIndex !== undefined) {
      for (let i = startIndex; i <= endIndex; i++) {
        newCurrent.push({ i, dom: i - startIndex });
        newRenderCurrent.push(i);
      }
    }

    this.current = newCurrent;

    return {
      renderCurrent: newRenderCurrent,
      shouldSetState: true,
    };
  }

  private getRenderList(scrollTop: number) {
    const lastScrollTop = this.lastScrollTop;

    const { headerHeight, layouts } = this.state;
    const { current } = this;
    const { height, renderAccuary = 5 } = this.props;

    const isScrollDown = lastScrollTop <= scrollTop;
    const len = layouts.length;

    // 需要render真实item的区域
    const bottomOffset = ((renderAccuary - 1) / 2 + 1) * height;
    const topOffset = (height * (renderAccuary - 1)) / 2;

    const start = Math.max(0, scrollTop - topOffset - headerHeight);
    const end = scrollTop + bottomOffset - headerHeight;

    let shouldSetState = false;

    if (current.length === 0) {
      return this.getRenderListFromEmpty(start, end);
    } else if (isScrollDown) {
      let isBreak = false;
      for (let i = 0, len = current.length; i < len; i++) {
        const thisCurrent = current[i];
        const thisLayout = layouts[thisCurrent.i];
        if (thisLayout.top + thisLayout.height < start) {
          this.topRemoveMap.push({
            i: thisCurrent.i,
            dom: thisCurrent.dom,
            type: thisLayout.type,
          });
        } else {
          current.splice(0, i);
          isBreak = true;
          break;
        }
      }

      if (!isBreak) {
        current.splice(0, current.length);
      }

      while (true) {
        const last = current[current.length - 1];

        if (last.i === len - 1) break;
        const lastLayout = layouts[last.i];
        const shouldAddNewItem = lastLayout.top + lastLayout.height < end;
        const ii = last.i + 1;
        const nextItem = layouts[ii];

        if (shouldAddNewItem) {
          shouldSetState = true;
          let shouldReuseOldItem = false;
          let oldRenderInfo: RenderInfo | undefined = undefined;
          const removed = this.bottomRemoveMap.getFirst(nextItem.type);
          const bottomOldItem = removed?.i;

          if (bottomOldItem !== undefined) {
            shouldReuseOldItem = true;
            oldRenderInfo = this.bottomRemoveMap.remove(nextItem.type, bottomOldItem);
          } else {
            const removed = this.topRemoveMap.getFirst(nextItem.type);
            const topOldItem = removed?.i;
            if (topOldItem !== undefined) {
              const oldItemLayout = layouts[topOldItem];
              shouldReuseOldItem = oldItemLayout.top + oldItemLayout.height < start;
              if (shouldReuseOldItem) {
                oldRenderInfo = this.topRemoveMap.remove(nextItem.type, topOldItem);
              }
            }
          }

          if (shouldReuseOldItem && oldRenderInfo) {
            current.push({ i: ii, dom: oldRenderInfo.dom });
            continue;
          }
          // 没有旧的模块可以复用，直接插入新的模块
          current.push({
            i: ii,
            dom:
              current.length +
              this.topRemoveMap.getList().length +
              this.bottomRemoveMap.getList().length,
          });
        } else {
          // 不需要向末尾增加模块了, 跳出循环
          break;
        }
      }
    } else if (!isScrollDown) {
      let isBreak = false;
      for (let i = current.length - 1; i > -1; i--) {
        const thisCurrent = current[i];

        const thisLayout = layouts[thisCurrent.i];
        if (thisLayout.top > end) {
          this.bottomRemoveMap.push({
            i: thisCurrent.i,
            dom: thisCurrent.dom,
            type: thisLayout.type,
          });
        } else {
          current.splice(i + 1, current.length - i - 1);
          isBreak = true;
          break;
        }
      }

      if (!isBreak) {
        // 全部删除
        current.splice(0, current.length);
      }

      while (true) {
        const first = current[0];
        if (first.i === 0) break;
        const firstLayout = layouts[first.i];
        const shouldAddNewItem = firstLayout.top + firstLayout.height > start;
        const ii = first.i - 1;
        const nextItem = layouts[ii];

        if (shouldAddNewItem) {
          shouldSetState = true;
          let shouldReuseOldItem = false;
          let oldRenderInfo: RenderInfo | undefined = undefined;
          const removed = this.topRemoveMap.getLast(nextItem.type);
          const topOldItem = removed?.i;

          if (topOldItem !== undefined) {
            shouldReuseOldItem = true;
            oldRenderInfo = this.topRemoveMap.remove(nextItem.type, topOldItem);
          } else {
            const removed = this.bottomRemoveMap.getLast(nextItem.type);
            const bottomOldItem = removed?.i;

            if (bottomOldItem !== undefined) {
              const oldItemLayout = layouts[bottomOldItem];
              shouldReuseOldItem = oldItemLayout.top > end;
              if (shouldReuseOldItem) {
                oldRenderInfo = this.bottomRemoveMap.remove(nextItem.type, bottomOldItem);
              }
            }
          }

          if (shouldReuseOldItem && oldRenderInfo) {
            current.unshift({ i: ii, dom: oldRenderInfo.dom });
            continue;
          }

          // 没有旧的模块可以复用，直接插入新的模块
          current.unshift({
            i: ii,
            dom:
              current.length +
              this.topRemoveMap.getList().length +
              this.bottomRemoveMap.getList().length,
          });
        } else {
          break;
        }
      }
    }

    const newRenderCurrent = [
      ...this.topRemoveMap.getList(),
      ...current,
      ...this.bottomRemoveMap.getList(),
    ]
      .sort((a, b) => a.dom - b.dom)
      .map((i) => i.i);

    return {
      renderCurrent: newRenderCurrent,
      shouldSetState,
    };
  }

  private handleScrollPure = (scrollTop: number) => {
    const info = this.getRenderList(scrollTop);
    if (info === null) return;
    const { shouldSetState, ...oterState } = info;
    if (shouldSetState) {
      this.setState(oterState);
    }
  };

  private handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const container = this.container.current;
    if (container) {
      const scrollTop = container.scrollTop;
      this.tryTriggerEndReachedEvent(scrollTop);
      this.triggerScrollEvent(scrollTop, event);
      this.computeShowEvent(scrollTop);
      const lastScrollTop = this.lastScrollTop;
      const { scrollComputeThrottle = 100 } = this.props;
      if (Math.abs(scrollTop - lastScrollTop) < scrollComputeThrottle) return;
      this.handleScrollPure(scrollTop);
      this.lastScrollTop = scrollTop;
    }
  };

  private triggerScrollEvent(scrollTop: number, event: React.UIEvent<HTMLDivElement>) {
    const { onScroll } = this.props;
    typeof onScroll === 'function' && onScroll(scrollTop, event);
  }

  private tryTriggerEndReachedEvent(scrollTop: number) {
    const { headerHeight, footerHeight, contentHeight } = this.state;
    const { onEndReachedThreshold = 500, onEndReached, height } = this.props;
    const totalHeight = headerHeight + footerHeight + contentHeight;
    if (totalHeight - scrollTop - height < onEndReachedThreshold) {
      typeof onEndReached === 'function' && onEndReached();
    }
  }

  private computeShowEvent(scrollTop: number) {
    this.computeCellShowEvent(scrollTop);
    this.comuteFooterShow(scrollTop);
    this.comuteHeaderShow(scrollTop);
  }

  private computeCellShowEvent(scrollTop: number) {
    const { onCellShow, onCellHide } = this.props;
    if (onCellShow === undefined && onCellHide === undefined) {
      return;
    }
    const start = scrollTop;
    const end = scrollTop + this.props.height;
    let firstShowItem: number = NaN,
      lastShowItem: number = NaN;

    const current = this.current;
    const layouts = this.state.layouts;

    for (let i = 0, len = this.current.length; i < len; i++) {
      const index = current[i].i;
      const layout = layouts[index];
      if (Number.isNaN(firstShowItem) && layout.top + layout.height > start) {
        firstShowItem = index;
      } else {
        if (layout.top > end) {
          lastShowItem = index - 1;
          break;
        }
      }
    }

    if (firstShowItem === this.cellFirstShowIndex && lastShowItem === this.cellLastShowIndex) {
      return;
    }

    if (Number.isNaN(this.cellFirstShowIndex) || Number.isNaN(this.cellLastShowIndex)) {
      for (let i = firstShowItem; i < lastShowItem; i++) {
        if (
          Number.isNaN(this.cellFirstShowIndex) ||
          i < this.cellFirstShowIndex ||
          i > this.cellLastShowIndex
        ) {
          typeof onCellShow === 'function' && onCellShow(i);
        }
      }
    } else {
      for (let i = firstShowItem; i < lastShowItem; i++) {
        if (i < this.cellFirstShowIndex || i >= this.cellLastShowIndex) {
          typeof onCellShow === 'function' && onCellShow(i);
        }
      }

      for (let i = this.cellFirstShowIndex; i < this.cellLastShowIndex; i++) {
        if (i < firstShowItem || i >= lastShowItem) {
          typeof onCellHide === 'function' && onCellHide(i);
        }
      }
    }

    this.cellFirstShowIndex = firstShowItem;
    this.cellLastShowIndex = lastShowItem;
  }

  private comuteHeaderShow(scrollTop: number) {
    const { onHeaderShow, onHeaderHide } = this.props;
    if (onHeaderShow === undefined && onHeaderHide === undefined) {
      return;
    }
    const currentShow = scrollTop < this.state.headerHeight;
    if (currentShow) {
      if (!this.headerShow) {
        typeof onHeaderHide === 'function' && delayCall(onHeaderHide);
      }
    } else {
      if (this.headerShow) {
        typeof onHeaderShow === 'function' && delayCall(onHeaderShow);
      }
    }
  }

  private comuteFooterShow(scrollTop: number) {
    const { onFooterShow, onFooterHide } = this.props;
    if (onFooterShow === undefined && onFooterHide === undefined) {
      return;
    }
    const currentShow = scrollTop > this.state.headerHeight + this.state.contentHeight;
    if (currentShow) {
      if (!this.footerShow) {
        typeof onFooterHide === 'function' && delayCall(onFooterHide);
      }
    } else {
      if (this.footerShow) {
        typeof onFooterShow === 'function' && delayCall(onFooterShow);
      }
    }
  }

  /**
   * 清空渲染状态
   */
  resetList() {
    this.topRemoveMap = new NAMap();
    this.bottomRemoveMap = new NAMap();
    this.current = [];
    this.handleScrollPure(
      this.container.current ? this.container.current.scrollTop : this.lastScrollTop
    );
  }

  scrollTo(offset: number) {
    this.handleScrollPure(offset);
    this.container.current?.scrollTo({ top: offset });
  }

  componentDidMount() {
    const scrollTop = this.props.defaultScrollTop || 0;
    this.handleScrollPure(scrollTop);
    this.computeShowEvent(scrollTop);
  }

  render() {
    const { height, width, style, className, Header, Footer, cellExtraProps } = this.props;
    const {
      renderCurrent,
      layouts,
      contentHeight,
      headerHeight,
      footerHeight,
      cellData,
    } = this.state;
    return (
      <div
        style={{ ...scrollStyle, ...style, width, height }}
        className={className}
        onScroll={this.handleScroll}
        ref={this.container}
      >
        <div
          style={{
            width,
            height: headerHeight + footerHeight + contentHeight,
            position: 'relative',
          }}
        >
          {Header ? (
            <Header
              onHeightChange={this.handleHeaderHeightChange}
              style={{ ...headerStyle, width }}
            />
          ) : null}
          {renderCurrent.map((layoutIndex, index) => {
            const layout = layouts[layoutIndex];
            const { type: TypeComponent, height, top, left, width } = layout;

            return (
              <CellWrapper
                key={index}
                height={height}
                width={width}
                top={top + headerHeight}
                left={left}
                index={layoutIndex}
                data={cellData[layoutIndex].data}
                Component={TypeComponent}
                uniqueKey={cellData[layoutIndex].uniqueKey}
                cellExtraProps={cellExtraProps}
              />
            );
          })}
          {Footer ? (
            <Footer
              onHeightChange={this.handleFooterHeightChange}
              style={{ ...headerStyle, width }}
            />
          ) : null}
        </div>
      </div>
    );
  }
}

export default RecyclerList;

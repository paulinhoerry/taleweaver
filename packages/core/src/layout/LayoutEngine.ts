import Config from '../Config';
import TreeSyncer from '../helpers/TreeSyncer';
import RenderNode from '../render/RenderNode';
import DocRenderNode from '../render/DocRenderNode';
import BlockRenderNode from '../render/BlockRenderNode';
import InlineRenderNode from '../render/InlineRenderNode';
import Box from './Box';
import DocBox from './DocBox';
import BlockBox from './BlockBox';
import InlineBox from './InlineBox';
import PageFlowBox from './PageFlowBox';
import LineFlowBox from './LineFlowBox';

class RenderToLayoutTreeSyncer extends TreeSyncer<RenderNode, Box> {
  protected config: Config;
  protected lastVersion: number;
  protected updatedPageFlowBoxes: PageFlowBox[];
  protected updatedLineFlowBoxes: LineFlowBox[];

  constructor(config: Config, lastVersion: number) {
    super();
    this.config = config;
    this.lastVersion = lastVersion;
    this.updatedPageFlowBoxes = [];
    this.updatedLineFlowBoxes = [];
  }

  getUpdatedPageFlowBoxes(): PageFlowBox[] {
    return Array.from(this.updatedPageFlowBoxes);
  }

  getUpdatedLineFlowBoxes(): LineFlowBox[] {
    return Array.from(this.updatedLineFlowBoxes);
  }

  getSrcNodeChildren(node: RenderNode): RenderNode[] {
    if (node instanceof DocRenderNode) {
      return node.getChildren();
    }
    if (node instanceof BlockRenderNode) {
      return node.getChildren();
    }
    return [];
  }

  getDstNodeChildren(node: Box): Box[] {
    if (node instanceof DocBox) {
      const children: BlockBox[] = [];
      node.getChildren().map(child => {
        children.push(...child.getChildren());
      });
      return children;
    }
    if (node instanceof BlockBox) {
      const children: InlineBox[] = [];
      node.getChildren().map(child => {
        children.push(...child.getChildren());
      });
      return children;
    }
    return [];
  }

  findSrcNodeInDstNodes(srcNode: RenderNode, dstNodes: Box[]): number {
    const id = srcNode.getID();
    const offset = dstNodes.findIndex(n => n.getRenderNodeID() === id);
    return offset;
  }

  insertNode(parent: Box, srcNode: RenderNode, offset: number): Box {
    if (parent instanceof DocBox && srcNode instanceof BlockRenderNode) {
      const BlockBoxClass = this.config.getBoxClass(srcNode.getType());
      const blockBox = new BlockBoxClass(srcNode.getID());
      if (!(blockBox instanceof BlockBox)) {
        throw new Error('Error inserting box, expecting block box.');
      }
      blockBox.setVersion(srcNode.getVersion());
      const pageFlowBoxes = parent.getChildren();
      let cumulatedOffset = 0;
      let inserted = false;
      for (let n = 0, nn = pageFlowBoxes.length; n < nn; n++) {
        const pageFlowBox = pageFlowBoxes[n];
        if (cumulatedOffset + pageFlowBox.getChildren().length >= offset) {
          pageFlowBox.insertChild(blockBox, offset - cumulatedOffset);
          this.updatedPageFlowBoxes.push(pageFlowBox);
          inserted = true;
          break;
        }
        cumulatedOffset += pageFlowBox.getChildren().length;
      }
      if (!inserted) {
        const pageFlowBox = new PageFlowBox(parent.getWidth(), parent.getHeight(), parent.getPadding());
        parent.insertChild(pageFlowBox, pageFlowBoxes.length);
        pageFlowBox.insertChild(blockBox, 0);
        this.updatedPageFlowBoxes.push(pageFlowBox);
      }
      return blockBox;
    }
    if (parent instanceof BlockBox && srcNode instanceof InlineRenderNode) {
      const InlineBoxClass = this.config.getBoxClass(srcNode.getType());
      const inlineBox = new InlineBoxClass(srcNode.getID());
      if (!(inlineBox instanceof InlineBox)) {
        throw new Error('Error inserting box, expecting inline box.');
      }
      inlineBox.setVersion(srcNode.getVersion());
      const lineFlowBoxes = parent.getChildren();
      let cumulatedOffset = 0;
      let inserted = false;
      for (let n = 0, nn = lineFlowBoxes.length; n < nn; n++) {
        const lineFlowBox = lineFlowBoxes[n];
        if (cumulatedOffset + lineFlowBox.getChildren().length >= offset) {
          lineFlowBox.insertChild(inlineBox, offset - cumulatedOffset);
          this.updatedLineFlowBoxes.push(lineFlowBox);
          inserted = true;
          break;
        }
        cumulatedOffset += lineFlowBox.getChildren().length;
      }
      if (!inserted) {
        const lineFlowBox = new LineFlowBox(parent.getWidth());
        parent.insertChild(lineFlowBox, lineFlowBoxes.length);
        lineFlowBox.insertChild(inlineBox, 0);
        this.updatedLineFlowBoxes.push(lineFlowBox);
      }
      return inlineBox;
    }
    throw new Error('Error inserting box, type mismatch.');
  }

  deleteNode(parent: Box, node: Box) {
    if (parent instanceof DocBox && node instanceof BlockBox) {
      const pageFlowBoxes = parent.getChildren();
      for (let n = 0, nn = pageFlowBoxes.length; n < nn; n++) {
        const pageFlowBox = pageFlowBoxes[n];
        if (pageFlowBox.getChildren().indexOf(node) >= 0) {
          pageFlowBox.deleteChild(node);
          if (pageFlowBox.getChildren().length === 0) {
            parent.deleteChild(pageFlowBox);
          } else {
            this.updatedPageFlowBoxes.push(pageFlowBox);
          }
          break;
        }
      }
      return;
    }
    if (parent instanceof BlockBox && node instanceof InlineBox) {
      const lineFlowBoxes = parent.getChildren();
      for (let n = 0, nn = lineFlowBoxes.length; n < nn; n++) {
        const lineFlowBox = lineFlowBoxes[n];
        if (lineFlowBox.getChildren().indexOf(node) >= 0) {
          lineFlowBox.deleteChild(node);
          if (lineFlowBox.getChildren().length === 0) {
            parent.deleteChild(lineFlowBox);
          } else {
            this.updatedLineFlowBoxes.push(lineFlowBox);
          }
          break;
        }
      }
      return;
    }
    throw new Error('Error deleting box, type mismatch.');
  }

  updateNode(node: Box, srcNode: RenderNode): boolean {
    if (node instanceof DocBox && srcNode instanceof DocRenderNode) {
      if (srcNode.getVersion() <= this.lastVersion) {
        return false;
      }
      node.onRenderUpdated(srcNode);
      node.setVersion(srcNode.getVersion());
      return true;
    }
    if (node instanceof BlockBox && srcNode instanceof BlockRenderNode) {
      if (srcNode.getVersion() <= this.lastVersion) {
        return false;
      }
      node.onRenderUpdated(srcNode);
      node.setVersion(srcNode.getVersion());
      const pageFlowBox = node.getParent();
      if (pageFlowBox.getVersion() < srcNode.getVersion()) {
        pageFlowBox.setVersion(srcNode.getVersion());
      }
      this.updatedPageFlowBoxes.push(pageFlowBox);
      return true;
    }
    if (node instanceof InlineBox && srcNode instanceof InlineRenderNode) {
      if (srcNode.getVersion() <= this.lastVersion) {
        return false;
      }
      node.onRenderUpdated(srcNode);
      node.setVersion(srcNode.getVersion());
      const lineFlowBox = node.getParent();
      if (lineFlowBox.getVersion() < srcNode.getVersion()) {
        lineFlowBox.setVersion(srcNode.getVersion());
      }
      this.updatedLineFlowBoxes.push(lineFlowBox);
      return true;
    }
    throw new Error('Error updating box, type mismatch.');
  }
}

export default class LayoutEngine {
  protected config: Config;
  protected docRenderNode: DocRenderNode;
  protected docBox: DocBox;
  protected ran: boolean;
  protected version: number;
  
  constructor(config: Config, docRenderNode: DocRenderNode) {
    this.config = config;
    this.docRenderNode = docRenderNode;
    this.docBox = new DocBox(docRenderNode.getID());
    this.docBox.onRenderUpdated(docRenderNode);
    this.ran = false;
    this.version = -1;
    this.docRenderNode.subscribeOnUpdated(() => {
      this.run();
    });
  }

  getDocBox(): DocBox {
    if (!this.ran) {
      this.run();
    }
    return this.docBox;
  }

  protected run() {
    const treeSyncer = new RenderToLayoutTreeSyncer(this.config, this.version);
    treeSyncer.syncNodes(this.docRenderNode, this.docBox);
    const newVersion = this.docRenderNode.getVersion();
    const updatedLineFlowBoxes = treeSyncer.getUpdatedLineFlowBoxes();
    let lastLineFlowBox: LineFlowBox | undefined = undefined;
    updatedLineFlowBoxes.forEach(lineFlowBox => {
      if (lastLineFlowBox && lastLineFlowBox === lineFlowBox) {
        return;
      }
      this.reflowLineFlowBox(lineFlowBox, newVersion);
      lastLineFlowBox = lineFlowBox;
    });
    const updatedPageFlowBoxes = treeSyncer.getUpdatedPageFlowBoxes();
    let lastPageFlowBox: PageFlowBox | undefined = undefined;
    updatedPageFlowBoxes.forEach(pageFlowBox => {
      if (lastPageFlowBox && lastPageFlowBox === pageFlowBox) {
        return;
      }
      this.reflowPageFlowBox(pageFlowBox, newVersion);
      lastPageFlowBox = pageFlowBox;
    });
    this.ran = true;
    this.version = newVersion;
    this.docBox.onUpdated();
  }

  protected reflowLineFlowBox(lineFlowBox: LineFlowBox, version: number) {
    let currentLineFlowBox = lineFlowBox;
    const blockBox = currentLineFlowBox.getParent();
    if (blockBox.getChildren().indexOf(currentLineFlowBox) < 0) {
      // Line box was already reflowed and removed when
      // reflowing a previous line, nothing more needs
      // to be done
      return;
    }
    const lineBoxWidth = currentLineFlowBox.getWidth();
    let cumulatedWidth = 0;
    let n = 0;
    while (true) {
      let inlineBox = currentLineFlowBox.getChildren()[n];
      if (cumulatedWidth + inlineBox.getWidth() > lineBoxWidth) {
        // With this inline box, the line width limit gets exceeded,
        // so we need to determine where to cleave this inline box
        for (let m = 0; m < inlineBox.getChildren().length; m++) {
          let atomicBox = inlineBox.getChildren()[m];
          if (cumulatedWidth + atomicBox.getWidth() > lineBoxWidth) {
            // With this atomic box, the line width limit gets exceeded,
            // so we cleave the line box after this inline box, and then
            // cleave the inline box before this atomic box
            const newLineFlowBox = currentLineFlowBox.cleaveAt(n + 1);
            newLineFlowBox.setVersion(version);
            blockBox.insertChild(newLineFlowBox, blockBox.getChildren().indexOf(currentLineFlowBox) + 1);
            currentLineFlowBox = newLineFlowBox;
            n = 0;
            const newInlineBox = inlineBox.cleaveAt(m);
            newInlineBox.setVersion(version);
            currentLineFlowBox.insertChild(newInlineBox, currentLineFlowBox.getChildren().indexOf(inlineBox) + 1);
            inlineBox = newInlineBox;
            m = 0;
            cumulatedWidth = 0;
          }
          cumulatedWidth += atomicBox.getWidth();
        }
      }
      cumulatedWidth += inlineBox.getWidth();
      n++;
      if (n === currentLineFlowBox.getChildren().length) {
        const lineBoxOffset = blockBox.getChildren().indexOf(currentLineFlowBox);
        if (lineBoxOffset >= blockBox.getChildren().length - 1) {
          // Last line box in block box reached
          break;
        }
        const nextLineFlowBox = blockBox.getChildren()[lineBoxOffset + 1];
        const nextAtomicBox = nextLineFlowBox.getChildren()[0].getChildren()[0];
        if (cumulatedWidth + nextAtomicBox.getWidth() <= currentLineFlowBox.getWidth()) {
          // The first atomic box of the next line box can fit on this
          // line box, so we merge the next line box into this line box
          // and continue with reflow
          nextLineFlowBox.getChildren().forEach(nextInlineBox => {
            currentLineFlowBox.insertChild(nextInlineBox, currentLineFlowBox.getChildren().length);
          });
          blockBox.deleteChild(nextLineFlowBox);
        } else {
          break;
        }
      }
    }
  }

  protected reflowPageFlowBox(pageFlowBoxToReflow: PageFlowBox, version: number) {
    let pageFlowBox = pageFlowBoxToReflow;
    const docBox = pageFlowBox.getParent();
    if (docBox.getChildren().indexOf(pageFlowBox) < 0) {
      // Page box was already reflowed and removed when
      // reflowing a previous page, nothing more needs
      // to be done
      return;
    }
    const pageFlowBoxHeight = pageFlowBox.getInnerHeight();
    let cumulatedHeight = 0;
    let n = 0;
    while (true) {
      let blockBox = pageFlowBox.getChildren()[n];
      if (cumulatedHeight + blockBox.getHeight() > pageFlowBoxHeight) {
        // With this block box, the page height limit gets exceeded,
        // so we need to determine where to cleave this block box
        for (let m = 0; m < blockBox.getChildren().length; m++) {
          let lineBox = blockBox.getChildren()[m];
          if (cumulatedHeight + lineBox.getHeight() > pageFlowBoxHeight) {
            // With this line box, the page height limit gets exceeded,
            // so we cleave the page box after this block box, and then
            // cleave the block box before this line box
            const newPageFlowBox = pageFlowBox.cleaveAt(n + 1);
            newPageFlowBox.setVersion(version);
            docBox.insertChild(newPageFlowBox, docBox.getChildren().indexOf(pageFlowBox) + 1);
            pageFlowBox = newPageFlowBox;
            n = 0;
            const newBlockBox = blockBox.cleaveAt(m);
            newBlockBox.setVersion(version);
            pageFlowBox.insertChild(newBlockBox, pageFlowBox.getChildren().indexOf(blockBox) + 1);
            blockBox = newBlockBox;
            m = 0;
            cumulatedHeight = 0;
          }
          cumulatedHeight += lineBox.getHeight();
        }
      }
      cumulatedHeight += blockBox.getHeight();
      n++;
      if (n === pageFlowBox.getChildren().length) {
        const pageFlowBoxOffset = docBox.getChildren().indexOf(pageFlowBox);
        if (pageFlowBoxOffset >= docBox.getChildren().length - 1) {
          // Last page box in doc box reached
          break;
        }
        const nextPageFlowBox = docBox.getChildren()[pageFlowBoxOffset + 1];
        const nextLineFlowBox = nextPageFlowBox.getChildren()[0].getChildren()[0];
        if (cumulatedHeight + nextLineFlowBox.getHeight() <= pageFlowBox.getInnerHeight()) {
          // The first line box of the next page box can fit on this
          // page box, so we merge the next page box into this page box
          // and continue with reflow
          nextPageFlowBox.getChildren().forEach(nextBlockBox => {
            pageFlowBox.insertChild(nextBlockBox, pageFlowBox.getChildren().length);
          });
          docBox.deleteChild(nextPageFlowBox);
        } else {
          break;
        }
      }
    }
  }
}
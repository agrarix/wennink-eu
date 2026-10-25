// tree.js - Interactive D3.js family tree rendering and management

let svg = null;
let g = null;
let zoomBehavior = null;

export function renderFamilyTree(containerId, nodes, isAdmin, onNodeClick) {
  const container = document.getElementById(containerId);
  container.innerHTML = ''; // Clear previous tree

  if (!nodes || nodes.length === 0) {
    container.innerHTML = '<p class="no-data">Geen stamboomgegevens beschikbaar.</p>';
    return;
  }

  // Setup dimensions
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 500;

  console.log("renderFamilyTree called with nodes:", JSON.parse(JSON.stringify(nodes)));

  // Filter primary nodes (bloodline) to build D3 hierarchy
  const primaryNodes = nodes.filter(d => !d.isPartner);
  
  // Find partners dictionary
  const partnersMap = {};
  nodes.forEach(n => {
    if (n.partnerId !== undefined && n.partnerId !== null && n.partnerId !== '') {
      const partnerNode = nodes.find(other => other.id !== undefined && other.id !== null && Number(other.id) === Number(n.partnerId));
      if (partnerNode) {
        partnersMap[Number(n.id)] = partnerNode;
        partnersMap[String(n.id)] = partnerNode;
      }
    }
  });
  console.log("Resolved partnersMap:", partnersMap);

  // Verify that all parentIds point to existing primary nodes.
  // If not, set parentId to undefined to prevent stratify crashes.
  const primaryIds = new Set(primaryNodes.map(d => Number(d.id)));
  primaryNodes.forEach(node => {
    if (node.parentId && !primaryIds.has(Number(node.parentId))) {
      console.warn(`Node ${node.name} has missing parentId ${node.parentId}. Detaching parent.`);
      node.parentId = undefined;
    }
  });

  const virtualRootId = 'virtual_root_parent_node_id';

  // Create a copy of primary nodes to add the virtual root
  const treeNodesCopy = primaryNodes.map(d => ({ ...d }));
  
  // Find all nodes in treeNodesCopy that have no parentId
  const realRoots = treeNodesCopy.filter(d => !d.parentId);
  
  // Add virtual root parent
  treeNodesCopy.push({
    id: virtualRootId,
    name: 'Virtual Root',
    birthYear: '',
    deathYear: ''
  });
  
  // Set parentId of real roots to virtualRootId
  realRoots.forEach(d => {
    d.parentId = virtualRootId;
  });

  // Stratify primary nodes using the copy
  let root;
  try {
    const stratify = d3.stratify()
      .id(d => d.id)
      .parentId(d => d.parentId);
    root = stratify(treeNodesCopy);
  } catch (err) {
    console.error('Stratification failed, check tree cycles or orphaned children:', err);
    container.innerHTML = `<div class="error-msg">Fout bij laden stamboom. Controleer de data. <br>${err.message}</div>`;
    return;
  }

  // Define layout node sizes
  const nodeWidth = 110;
  const nodeHeight = 55;
  const coupleSpacing = 130; // Horizontal shift for spouse
  
  // Create tree layout
  const treeLayout = d3.tree()
    .nodeSize([250, 150]); // [horizontal spacing, vertical spacing]

  treeLayout(root);

  // Create SVG element
  svg = d3.select(`#${containerId}`)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .style('overflow', 'hidden');

  // Inner group for zoom/pan
  g = svg.append('g').attr('class', 'tree-content-group');

  // Setup Zoom Behavior
  zoomBehavior = d3.zoom()
    .scaleExtent([0.2, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svg.call(zoomBehavior);

  // Draw links (Bezier curves)
  const links = root.links().filter(link => link.source.data.id !== virtualRootId);
  
  g.selectAll('.link')
    .data(links)
    .enter()
    .append('path')
    .attr('class', 'tree-link')
    .attr('d', d => {
      // Source is the parent. We check if they have a partner.
      // If they do, the link should start from the middle of the couple.
      const parentHasPartner = partnersMap[Number(d.source.data.id)] || partnersMap[String(d.source.data.id)];
      let startX = d.source.x;
      let startY = d.source.y + nodeHeight / 2;

      if (parentHasPartner) {
        // Center of the couple is midway between primary and partner
        startX = d.source.x + coupleSpacing / 2;
      }

      const targetX = d.target.x;
      const targetY = d.target.y - nodeHeight / 2;

      // Draw beautiful curved Bezier path
      return `M ${startX} ${startY}
              C ${startX} ${(startY + targetY) / 2},
                ${targetX} ${(startY + targetY) / 2},
                ${targetX} ${targetY}`;
    });

  // Draw couples horizontal connectors
  const couples = primaryNodes.filter(n => partnersMap[Number(n.id)] || partnersMap[String(n.id)]);
  g.selectAll('.couple-link')
    .data(couples)
    .enter()
    .append('line')
    .attr('class', 'couple-link')
    .attr('x1', d => {
      const node = root.descendants().find(desc => Number(desc.data.id) === Number(d.id));
      return node ? node.x : 0;
    })
    .attr('y1', d => {
      const node = root.descendants().find(desc => Number(desc.data.id) === Number(d.id));
      return node ? node.y : 0;
    })
    .attr('x2', d => {
      const node = root.descendants().find(desc => Number(desc.data.id) === Number(d.id));
      return node ? node.x + coupleSpacing : 0;
    })
    .attr('y2', d => {
      const node = root.descendants().find(desc => Number(desc.data.id) === Number(d.id));
      return node ? node.y : 0;
    });

  // Draw Node Groups
  const nodesSelection = g.selectAll('.node-group')
    .data(root.descendants().filter(d => d.data.id !== virtualRootId))
    .enter()
    .append('g')
    .attr('class', 'node-group');

  // Draw Primary Cards
  nodesSelection.each(function(d) {
    const group = d3.select(this);
    const hasPartner = partnersMap[Number(d.data.id)] || partnersMap[String(d.data.id)];
    console.log("Rendering node:", d.data.name, "id:", d.data.id, "hasPartner:", hasPartner ? hasPartner.name : "none");

    // Primary Card
    drawCard(group, d.data, d.x, d.y, nodeWidth, nodeHeight, false, isAdmin, onNodeClick);

    // Partner Card (if exists)
    if (hasPartner) {
      drawCard(group, hasPartner, d.x + coupleSpacing, d.y, nodeWidth, nodeHeight, true, isAdmin, onNodeClick);
    }
  });

  // Center the tree initially
  centerTree(width, height);
}

function drawCard(group, data, x, y, width, height, isSpouse, isAdmin, onNodeClick) {
  const card = group.append('g')
    .attr('class', `tree-card ${isSpouse ? 'spouse-card' : 'bloodline-card'}`)
    .attr('transform', `translate(${x - width/2}, ${y - height/2})`)
    .on('click', (event) => {
      event.stopPropagation();
      onNodeClick(data);
    });

  // Background rect
  card.append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('rx', 8)
    .attr('ry', 8);

  // Text container
  const textGroup = card.append('g')
    .attr('transform', `translate(10, 15)`);

  // Name
  const nameToRender = data.name + (data.deathYear && data.deathYear.trim() !== '' ? ' †' : '');
  textGroup.append('text')
    .attr('class', 'card-name')
    .text(nameToRender)
    .attr('width', width - 20)
    .each(function() {
      // Wrap long names
      const self = d3.select(this);
      const textLength = self.node().getComputedTextLength();
      if (textLength > width - 20) {
        const words = nameToRender.split(/\s+/);
        self.text('');
        let line = [];
        let lineCount = 0;
        words.forEach(word => {
          line.push(word);
          self.text(line.join(' '));
          if (self.node().getComputedTextLength() > width - 20 && line.length > 1) {
            line.pop();
            self.text(line.join(' '));
            if (lineCount === 0) {
              textGroup.append('text')
                .attr('class', 'card-name')
                .attr('y', 14)
                .text(word);
              lineCount++;
            }
          }
        });
      }
    });

  // Dates
  const dates = data.birthYear ? `${data.birthYear} - ${data.deathYear || ''}` : '';
  textGroup.append('text')
    .attr('class', 'card-dates')
    .attr('y', 34)
    .text(dates);

  // Admin tag marker (subtle badge if admin editing is active)
  if (isAdmin) {
    card.append('circle')
      .attr('cx', width - 10)
      .attr('cy', 10)
      .attr('r', 4)
      .attr('fill', '#e06666')
      .attr('title', 'Admin edit available');
  }
}

function centerTree(containerWidth, containerHeight) {
  if (!svg || !g) return;

  const bbox = g.node().getBBox();
  if (bbox.width === 0 || bbox.height === 0) return;
  const x = (containerWidth - bbox.width * 0.85) / 2 - bbox.x * 0.85;
  const y = 40 - bbox.y * 0.85;

  const transform = d3.zoomIdentity.translate(x, y).scale(0.85);
  svg.call(zoomBehavior.transform, transform);
}

export function zoomIn() {
  if (svg) svg.transition().duration(250).call(zoomBehavior.scaleBy, 1.3);
}

export function zoomOut() {
  if (svg) svg.transition().duration(250).call(zoomBehavior.scaleBy, 0.7);
}

export function resetZoom(containerId) {
  if (!svg || !g) return;
  const container = document.getElementById(containerId);
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 500;
  centerTree(width, height);
}

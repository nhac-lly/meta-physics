/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  Color,
  Mesh,
  PhysicsBody,
  PhysicsShape,
  PhysicsState,
  PhysicsShapeType,
  PhysicsManipulation,
  SphereGeometry,
  MeshStandardMaterial,
  FrontSide,
  SessionMode,
  World,
} from '@iwsdk/core';
import { Vector3, Vector2, Raycaster, DirectionalLight, AmbientLight, PCFSoftShadowMap } from 'three';

const assets = {};

World.create(document.getElementById('scene-container'), {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    features: { handTracking: true },
  },
  level: '/glxf/Composition.glxf',
  features: {
    grabbing: true,
    locomotion: true,
    physics: true,
  },
}).then((world) => {
  const { scene, camera, renderer } = world;
  camera.position.set(5, 2, 5);
  camera.rotateY(Math.PI / 4);

  scene.background = new Color(0x808080);

  // Enable shadows
  if (renderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
  }

  // Add ambient light
  const ambientLight = new AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  // Add directional light with shadows
  const directionalLight = new DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 5);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 50;
  directionalLight.shadow.camera.left = -10;
  directionalLight.shadow.camera.right = 10;
  directionalLight.shadow.camera.top = 10;
  directionalLight.shadow.camera.bottom = -10;
  scene.add(directionalLight);

  // Enable shadows on scene objects
  scene.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  const body = new Mesh(
    new SphereGeometry(0.2),
    new MeshStandardMaterial({
      side: FrontSide,
      color: new Color(Math.random(), Math.random(), Math.random()),
    }),
  );
  body.position.set(-1, 1.5, 0.5);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);
  const entity = world.createTransformEntity(body);
  entity.addComponent(PhysicsShape, {
    shape: PhysicsShapeType.Sphere,
    dimensions: [0.2],
  });
  entity.addComponent(PhysicsBody, { state: PhysicsState.Dynamic });
  entity.addComponent(PhysicsManipulation, { force: [10, 1, 1] });

  // Camera walk controls for non-VR mode (Shapespark-style)
  const canvas = world.renderer.domElement;
  
  // Walk state
  const keys = {};
  const moveSpeed = 3;
  const lookSpeed = 0.002;
  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let mouseDownX = 0;
  let mouseDownY = 0;
  const euler = { x: camera.rotation.x, y: camera.rotation.y };
  const velocity = new Vector3();
  
  // Click-to-move state
  const raycaster = new Raycaster();
  const mouse = new Vector2();
  let targetPosition = null;
  let startPosition = new Vector3();
  let moveStartTime = 0;
  const moveDuration = 0.5; // seconds
  
  // Keyboard controls
  const handleKeyDown = (event) => {
    keys[event.code] = true;
  };
  
  const handleKeyUp = (event) => {
    keys[event.code] = false;
  };
  
  // Mouse look controls (click and drag, no pointer lock)
  const handleMouseDown = (event) => {
    if (world.xr?.isPresenting || event.button !== 0) return;
    
    isDragging = true;
    mouseDownX = event.clientX;
    mouseDownY = event.clientY;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    canvas.style.cursor = 'grabbing';
  };
  
  const handleMouseMove = (event) => {
    if (world.xr?.isPresenting) return;
    
    if (isDragging) {
      const moveDeltaX = event.clientX - lastMouseX;
      const moveDeltaY = event.clientY - lastMouseY;
      
      euler.y -= moveDeltaX * lookSpeed;
      euler.x -= moveDeltaY * lookSpeed;
      
      // Clamp vertical rotation
      euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    }
    
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
  };
  
  const handleMouseUp = (event) => {
    if (world.xr?.isPresenting || event.button !== 0) return;
    
    // Check if it was a click (no movement) vs a drag
    const deltaX = Math.abs(event.clientX - mouseDownX);
    const deltaY = Math.abs(event.clientY - mouseDownY);
    
    // If it was a click (not a drag), try to move to clicked position
    if (deltaX < 3 && deltaY < 3) {
      handleClickToMove(event);
    }
    
    isDragging = false;
    canvas.style.cursor = 'default';
  };
  
  // Click-to-move functionality
  const handleClickToMove = (event) => {
    // Calculate mouse position in normalized device coordinates
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update raycaster with camera and mouse position
    raycaster.setFromCamera(mouse, camera);
    
    // Find intersections with scene objects
    const intersects = raycaster.intersectObjects(scene.children, true);
    
    if (intersects.length > 0) {
      // Get the first intersection point
      const intersectionPoint = intersects[0].point;
      
      // Set target position (keep camera height, move horizontally)
      targetPosition = new Vector3(
        intersectionPoint.x,
        camera.position.y, // Keep current height
        intersectionPoint.z
      );
      
      startPosition.copy(camera.position);
      moveStartTime = performance.now() / 1000;
    }
  };
  
  // Set up event listeners
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseUp);
  
  // Animation loop for camera movement
  const updateCamera = (deltaTime, currentTime) => {
    // Only enable camera controls when not in VR mode
    if (world.xr?.isPresenting) return;
    
    // Update camera rotation
    camera.rotation.order = 'YXZ';
    camera.rotation.y = euler.y;
    camera.rotation.x = euler.x;
    
    // Handle click-to-move interpolation
    if (targetPosition) {
      const elapsed = currentTime - moveStartTime;
      const t = Math.min(elapsed / moveDuration, 1);
      
      // Smooth easing function (ease-in-out)
      const easedT = t < 0.5 
        ? 2 * t * t 
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
      
      camera.position.lerpVectors(startPosition, targetPosition, easedT);
      
      // Clear target when animation is complete
      if (t >= 1) {
        targetPosition = null;
      }
    } else {
      // Only allow keyboard movement if not moving to a target
      // Calculate movement direction
      velocity.set(0, 0, 0);
      
      if (keys['KeyW'] || keys['ArrowUp']) {
        velocity.z -= 1;
      }
      if (keys['KeyS'] || keys['ArrowDown']) {
        velocity.z += 1;
      }
      if (keys['KeyA'] || keys['ArrowLeft']) {
        velocity.x -= 1;
      }
      if (keys['KeyD'] || keys['ArrowRight']) {
        velocity.x += 1;
      }
      if (keys['Space']) {
        velocity.y += 1;
      }
      if (keys['ShiftLeft'] || keys['ShiftRight']) {
        velocity.y -= 1;
      }
      
      // Normalize and apply movement speed
      if (velocity.length() > 0) {
        velocity.normalize();
        velocity.multiplyScalar(moveSpeed * deltaTime);
        
        // Apply movement relative to camera direction
        const direction = new Vector3();
        camera.getWorldDirection(direction);
        direction.y = 0; // Keep movement horizontal
        direction.normalize();
        
        const right = new Vector3();
        right.crossVectors(direction, camera.up).normalize();
        
        const moveVector = new Vector3();
        moveVector.addScaledVector(direction, -velocity.z);
        moveVector.addScaledVector(right, velocity.x);
        moveVector.y = velocity.y;
        
        camera.position.add(moveVector);
      }
    }
  };
  
  // Integrate with world's animation loop
  let lastTime = performance.now();
  const animate = () => {
    const currentTimeMs = performance.now();
    const currentTime = currentTimeMs / 1000;
    const deltaTime = (currentTimeMs - lastTime) / 1000;
    lastTime = currentTimeMs;
    
    updateCamera(deltaTime, currentTime);
    requestAnimationFrame(animate);
  };
  animate();
});

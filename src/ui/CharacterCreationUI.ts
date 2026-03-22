import { t } from '../i18n/LanguageManager';
import { InputManager } from '../engine/InputManager';
import { UI, Parchment, renderGameTitle } from '../ui/UITheme';

interface CharConfig {
    id: string; // e.g. 'infantry'
    labelKey: string;
    hp: number; // 0.0 to 1.0 (for bar length)
    atk: number;
    def: number;
    mag: number;
    imageSrc: string; // path to 128x128 portrait
}

const CLASSES: CharConfig[] = [
    { id: 'infantry', labelKey: 'create.fighter', hp: 0.8, atk: 0.7, def: 0.6, mag: 0.2, imageSrc: '/Image/Character/fighter.png' },
    { id: 'cavalry', labelKey: 'create.knight', hp: 0.9, atk: 0.6, def: 0.9, mag: 0.3, imageSrc: '/Image/Character/knight.png' },
    { id: 'cleric', labelKey: 'create.cleric', hp: 0.6, atk: 0.3, def: 0.4, mag: 0.7, imageSrc: '/Image/Character/cleric.png' },
    { id: 'mage', labelKey: 'create.magician', hp: 0.4, atk: 0.3, def: 0.3, mag: 0.9, imageSrc: '/Image/Character/magician.png' },
];

export class CharacterCreationUI {
    private w = 640;
    private h = 480;
    private selectedClassIndex = 0;
    private selectedGender = 'M'; // 'M' or 'F'
    private focusSection = 0; // 0=class, 1=name, 2=gender, 3=confirm
    private nameInput: HTMLInputElement;
    
    // Individual class portrait images
    private classImages: HTMLImageElement[] = [];
    private classImagesLoaded: boolean[] = [];
    private bgImage = new Image();
    private bgLoaded = false;

    // Hover states
    private hoveredClassIndex = -1;
    private genderHovered = false;
    private termsHovered = false;
    private confirmHovered = false;

    // Callbacks
    public onComplete: (name: string, classId: string, gender: string) => void = () => {};

    // Internal geometry cached during render for mouse events
    private lastCx = 0;
    private lastCy = 0;
    private lastCanvasH = 0;

    constructor() {
        // Load individual class images
        for (let i = 0; i < CLASSES.length; i++) {
            const img = new Image();
            this.classImagesLoaded.push(false);
            const idx = i;
            img.onload = () => { this.classImagesLoaded[idx] = true; };
            img.src = CLASSES[i].imageSrc;
            this.classImages.push(img);
        }

        this.bgImage.src = 'public/assets/Start.jpg';
        this.bgImage.onload = () => { this.bgLoaded = true; };

        // Create hovering HTML input for Name
        this.nameInput = document.createElement('input');
        this.nameInput.type = 'text';
        this.nameInput.maxLength = 12;
        this.nameInput.style.position = 'absolute';
        this.nameInput.style.zIndex = '1000';
        this.nameInput.style.background = 'rgba(58, 38, 24, 0.85)';
        this.nameInput.style.color = '#f0e6d0';
        this.nameInput.style.border = '2px solid #c8a36d';
        this.nameInput.style.borderRadius = '6px';
        this.nameInput.style.fontFamily = '"DOSMyungjo", sans-serif';
        this.nameInput.style.fontSize = '18px';
        this.nameInput.style.padding = '6px 14px';
        this.nameInput.style.outline = 'none';
        this.nameInput.style.width = '160px';
        this.nameInput.style.boxSizing = 'border-box';
        this.nameInput.style.textAlign = 'left';
        this.nameInput.style.letterSpacing = '1px';
        this.nameInput.value = '다크마스터'; // Default name

        // Must append to body, GameEngine should clean it up/hide it
        document.body.appendChild(this.nameInput);
    }

    public destroy(): void {
        if (this.nameInput && this.nameInput.parentNode) {
            this.nameInput.parentNode.removeChild(this.nameInput);
        }
    }

    public onMouseMove(mx: number, my: number): void {
        const cx = this.lastCx;
        const cy = this.lastCy;

        // Reset hovers
        this.hoveredClassIndex = -1;
        this.genderHovered = false;
        this.confirmHovered = false;
        this.termsHovered = false;

        // Check class selection boxes
        const classCount = CLASSES.length;
        const boxW = 120;
        const boxH = 200;
        const gap = 20;
        const totalW = boxW * classCount + gap * (classCount - 1);
        const startX = cx + (this.w - totalW) / 2;
        const boxY = cy + 70;

        for (let i = 0; i < classCount; i++) {
            const bx = startX + i * (boxW + gap);
            if (mx >= bx && mx <= bx + boxW && my >= boxY && my <= boxY + boxH) {
                this.hoveredClassIndex = i;
            }
        }

        // Check gender toggle
        // Text is drawn left-aligned at cx + 330
        const gx = cx + 330;
        const gy = cy + 380;
        if (mx >= gx && mx <= gx + 130 && my >= gy - 15 && my <= gy + 15) {
            this.genderHovered = true;
        }

        // Check confirm button
        const btnX = cx + this.w - 120;
        const btnY = cy + this.h - 60;
        if (mx >= btnX && mx <= btnX + 80 && my >= btnY && my <= btnY + 40) {
            this.confirmHovered = true;
        }

        // Check Terms link (bottom-left of entire page)
        const termsX = 12;
        const termsY = this.lastCanvasH - 24;
        if (mx >= termsX && mx <= termsX + 100 && my >= termsY && my <= termsY + 16) {
            this.termsHovered = true;
        }
    }

    public onMouseDown(_mx: number, _my: number): void {
        if (this.hoveredClassIndex !== -1) {
            this.selectedClassIndex = this.hoveredClassIndex;
        }
        if (this.genderHovered) {
            this.selectedGender = this.selectedGender === 'M' ? 'F' : 'M';
        }
        if (this.termsHovered) {
            window.open('/legal.html', '_blank');
        }
        if (this.confirmHovered) {
            const finalName = this.nameInput.value.trim() || 'Hero';
            const selectedClassId = CLASSES[this.selectedClassIndex].id;
            this.onComplete(finalName, selectedClassId, this.selectedGender);
        }
    }

    public updateInput(input: InputManager): void {
        // Up/Down to navigate sections: 0=class, 1=name, 2=gender, 3=confirm
        if (input.justPressed('ArrowUp') || input.justPressed('KeyW')) {
            this.focusSection--;
            if (this.focusSection < 0) this.focusSection = 3;
            // Focus/blur name input based on section
            if (this.focusSection === 1) this.nameInput.focus();
            else this.nameInput.blur();
        }
        if (input.justPressed('ArrowDown') || input.justPressed('KeyS')) {
            this.focusSection++;
            if (this.focusSection > 3) this.focusSection = 0;
            if (this.focusSection === 1) this.nameInput.focus();
            else this.nameInput.blur();
        }

        // Left/Right behavior depends on section
        if (this.focusSection === 0) {
            // Class selection
            if (input.justPressed('ArrowLeft') || input.justPressed('KeyA')) {
                this.selectedClassIndex--;
                if (this.selectedClassIndex < 0) this.selectedClassIndex = CLASSES.length - 1;
            }
            if (input.justPressed('ArrowRight') || input.justPressed('KeyD')) {
                this.selectedClassIndex++;
                if (this.selectedClassIndex >= CLASSES.length) this.selectedClassIndex = 0;
            }
        } else if (this.focusSection === 2) {
            // Gender selection
            if (input.justPressed('ArrowLeft') || input.justPressed('ArrowRight') ||
                input.justPressed('KeyA') || input.justPressed('KeyD')) {
                this.selectedGender = this.selectedGender === 'M' ? 'F' : 'M';
            }
        }
        
        // Enter to confirm (or advance from section 3)
        if (input.justPressed('Enter')) {
            if (this.focusSection === 3 || this.focusSection === 0) {
                const finalName = this.nameInput.value.trim() || 'Hero';
                const selectedClassId = CLASSES[this.selectedClassIndex].id;
                this.onComplete(finalName, selectedClassId, this.selectedGender);
            } else {
                // Move to next section
                this.focusSection++;
                if (this.focusSection === 1) this.nameInput.focus();
                else this.nameInput.blur();
            }
        }
    }

    public render(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, hideInput: boolean = false): void {
        const cx = Math.floor(canvasW / 2 - this.w / 2);
        const cy = Math.floor(canvasH / 2 - this.h / 2);
        this.lastCx = cx;
        this.lastCy = cy;
        this.lastCanvasH = canvasH;

        // 0. Full-screen background image
        if (this.bgLoaded) {
            ctx.drawImage(this.bgImage, 0, 0, canvasW, canvasH);
        } else {
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, canvasW, canvasH);
        }

        // 1. Draw Panel Background (Parchment style)
        ctx.fillStyle = 'rgba(220, 185, 138, 0.92)'; // Semi-transparent parchment
        ctx.fillRect(cx, cy, this.w, this.h);
        
        ctx.strokeStyle = '#6b4c2a'; // Dark border
        ctx.lineWidth = 4;
        ctx.strokeRect(cx, cy, this.w, this.h);
        ctx.lineWidth = 1;

        // Shadow mapping inside the parchment for depth
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fillRect(cx + 4, cy + 4, this.w - 8, this.h - 8);

        // 2. Title
        ctx.fillStyle = '#3a2618';
        ctx.font = 'bold 24px "DOSMyungjo", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(t('create.title'), cx + this.w / 2, cy + 20);

        // 3. Render Class Boxes
        const classCount = CLASSES.length;
        const boxW = 126;
        const boxH = 230;
        const gap = 20;
        const totalW = boxW * classCount + gap * (classCount - 1);
        const startX = cx + (this.w - totalW) / 2;
        const boxY = cy + 70;

        for (let i = 0; i < classCount; i++) {
            const bx = startX + i * (boxW + gap);
            const isSelected = this.selectedClassIndex === i;
            const isHovered = this.hoveredClassIndex === i;

            // Box Background
            ctx.fillStyle = isSelected ? '#8a6b42' : (isHovered ? '#b8925e' : '#a88555');
            ctx.fillRect(bx, boxY, boxW, boxH);

            // Portrait block background
            ctx.fillStyle = '#f0f0f0';
            const portraitSize = 64;
            const px = bx + (boxW - portraitSize) / 2;
            const py = boxY + 16;
            ctx.fillRect(px, py, portraitSize, portraitSize);
            ctx.strokeStyle = Parchment.borderDark;
            ctx.lineWidth = 1;
            ctx.strokeRect(px, py, portraitSize, portraitSize);

            // Selection indicator (golden glow for selected, subtle for others)
            if (isSelected) {
                ctx.save();
                ctx.shadowColor = 'rgba(212, 168, 70, 0.7)';
                ctx.shadowBlur = 16;
                ctx.strokeStyle = Parchment.borderGold;
                ctx.lineWidth = 3;
                ctx.strokeRect(bx, boxY, boxW, boxH);
                ctx.restore();
                // Light fill overlay
                ctx.fillStyle = 'rgba(255, 215, 0, 0.08)';
                ctx.fillRect(bx + 1, boxY + 1, boxW - 2, boxH - 2);
            } else if (isHovered) {
                ctx.strokeStyle = '#a08050';
                ctx.lineWidth = 2;
                ctx.strokeRect(bx, boxY, boxW, boxH);
            } else {
                ctx.strokeStyle = Parchment.borderLight;
                ctx.lineWidth = 1;
                ctx.strokeRect(bx, boxY, boxW, boxH);
            }

            // Draw Portrait Image
            if (this.classImagesLoaded[i]) {
                ctx.drawImage(this.classImages[i], px, py, portraitSize, portraitSize);
            }

            // Class Name
            ctx.fillStyle = Parchment.textDark;
            ctx.font = `bold 15px ${UI.fontPrimary}`;
            ctx.textBaseline = 'top';
            ctx.fillText(t(CLASSES[i].labelKey as any), bx + boxW / 2, py + portraitSize + 12);

            // Stat Bars (wider, thicker, with pct labels)
            const statNames = [t('create.hp'), t('create.atk'), t('create.def'), t('create.mag')];
            const statValues = [CLASSES[i].hp, CLASSES[i].atk, CLASSES[i].def, CLASSES[i].mag];
            const statColors = ['#e6a817', '#dc3545', '#2060c0', '#28a745'];
            
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = `bold 13px ${UI.fontPrimary}`;
            const barW = 50;
            const barH = 12;
            const barStartX = bx + 48;
            
            for (let s = 0; s < 4; s++) {
                const textY = py + portraitSize + 48 + s * 22;
                ctx.fillStyle = '#1a1008';
                ctx.font = `bold 14px ${UI.fontPrimary}`;
                ctx.fillText(statNames[s], bx + 10, textY);
                
                // Bar Background (rounded)
                ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
                ctx.beginPath();
                ctx.roundRect(barStartX, textY - barH / 2, barW, barH, 3);
                ctx.fill();
                
                // Bar Fill
                const fillW = barW * statValues[s];
                if (fillW > 0) {
                    ctx.fillStyle = statColors[s];
                    ctx.beginPath();
                    ctx.roundRect(barStartX, textY - barH / 2, fillW, barH, 3);
                    ctx.fill();
                }
            }
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic'; // reset
        }

        // 4. Name input rendering / alignment
        const promptY = cy + 340;
        
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#3a2618';
        ctx.font = '18px "DOSMyungjo", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(t('create.namePrompt'), cx + 300, promptY);
        
        if (hideInput) {
            this.nameInput.style.display = 'none';
        } else {
            // Sync the HTML Input over the canvas
            const inputX = cx + 330;
            
            const canvasBounds = ctx.canvas.getBoundingClientRect();
            const scaleX = canvasBounds.width / canvasW;
            const scaleY = canvasBounds.height / canvasH;

            // Apply scale directly to CSS properties instead of using transform
            // This avoids transform-origin and alignment inconsistencies
            const scaledWidth = 140 * scaleX;
            const scaledFontSize = 18 * scaleY;
            const padV = 4 * scaleY;
            const padH = 12 * scaleX;
            const totalHeight = scaledFontSize + (padV * 2) + (2 * scaleY); // +2 for border
            
            // Center the input vertically at promptY
            // So top = promptY * scaleY - totalHeight / 2
            const absoluteY = canvasBounds.top + (promptY * scaleY) - (totalHeight / 2);

            this.nameInput.style.display = 'block';
            this.nameInput.style.left = `${canvasBounds.left + inputX * scaleX}px`;
            this.nameInput.style.top = `${absoluteY}px`;
            this.nameInput.style.width = `${scaledWidth}px`;
            this.nameInput.style.fontSize = `${scaledFontSize}px`;
            this.nameInput.style.padding = `${padV}px ${padH}px`;
            this.nameInput.style.borderWidth = `${1 * Math.max(1, scaleY)}px`;
            
            // Remove transform
            this.nameInput.style.transform = 'none';
        }

        // 5. Gender selection
        const genderY = cy + 380;
        const isMale = this.selectedGender === 'M';
        const isFemale = this.selectedGender === 'F';
        
        ctx.fillStyle = '#3a2618';
        ctx.font = '18px "DOSMyungjo", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(t('create.genderPrompt'), cx + 300, genderY);
        
        const genderText = `< ${isMale ? '▶' : ''}남 : ${isFemale ? '▶' : ''}여 >`;
        ctx.fillStyle = this.genderHovered ? '#8c6239' : '#3a2618';
        ctx.font = 'bold 20px "DOSMyungjo", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(genderText, cx + 330, genderY);

        // 6. Confirm Button (medieval style)
        const btnW = 120;
        const btnH = 44;
        const btnX = cx + this.w - 160;
        const btnY = cy + this.h - 65;
        
        // Button background
        ctx.save();
        if (this.confirmHovered) {
            ctx.shadowColor = 'rgba(212, 168, 70, 0.5)';
            ctx.shadowBlur = 12;
        }
        ctx.fillStyle = this.confirmHovered ? '#6b4c2a' : '#8c6239';
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, btnH, 8);
        ctx.fill();
        ctx.restore();
        
        // Double border
        ctx.strokeStyle = Parchment.borderDark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, btnH, 8);
        ctx.stroke();
        ctx.strokeStyle = Parchment.borderLight;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(btnX + 3, btnY + 3, btnW - 6, btnH - 6, 5);
        ctx.stroke();
        
        ctx.fillStyle = '#f0e6d0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold 18px ${UI.fontPrimary}`;
        ctx.fillText(t('create.confirm'), btnX + btnW / 2, btnY + btnH / 2);

        // ─── EPIC GAME TITLE (top-left) ──────────────────────
        renderGameTitle(ctx, 16, 12, { scale: 0.9, subtitle: 'Grid SRPG Engine v0.1' });



        // 8. Terms | Privacy link (bottom-left of entire page)
        ctx.fillStyle = this.termsHovered ? 'rgba(200,170,80,0.8)' : 'rgba(100,80,50,0.5)';
        ctx.font = `11px ${UI.fontPrimary}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Terms | Privacy', 12, canvasH - 8);

        // Reset text alignments
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }
}

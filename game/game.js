/* Galaga - Vanilla JavaScript + HTML5 Canvas 
No frameworks, no build steps. The whole game runs client-side, which is why it containerizers so cleanly.
It's just static files served by a web server.

Assets: drop player.png, enemy.png, and bullet.png into the ./assets/. If an image is missing or fails 
to load, the game draws a colored shape instead, so it stays playable even before you add art.
*/

(() => {
    "use strict";

    // Canvas & context
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    // HUD elements
    const scoreEl = document.getElementById("score");
    const highEl = document.getElementById("highscore");
    const livesEl = document.getElementById("lives");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayText = document.getElementById("overlay-text");

    // asset loading (with graceful fallback)
    function loadImage(src) {
        const img = new Image();
        img.loaded = false;
        img.onload = () => (img.loaded = true);
        img.onerror = () => (img.loaded = false); // fall back option to colored shapes
        img.src = src;
        return img;
    }

    const sprites = {
        player: loadImage("assets/player.png"),
        enemy: loadImage("assets/enemy.png"),
        bullet: loadImage("assets/bullet.png"),
    };

    // game state
    const STATE = { MENU: "menu", PLAYING: "playing", OVER: "over" };
    let state = STATE.MENU;

    let score = 0;
    let highScore = Number(localStorage.getItem("galaga-high") || 0);
    let lives = 3;

    highEl.textContent = highScore;

    // Player
    const player = {
        w: 40,
        h: 40,
        x: W / 2 - 20,
        y: H - 60,
        speed: 5,
        cooldown: 0, //frames until next shot allowed
    };

    // Entity arrays
    let bullets = []; // player bullets
    let enemyBullets = [];
    let enemies = [];

    // formation movement (idle side to side drift)
    let formationDir = 1; // 1 = right, -1 = left
    let formationSpeed = 0.6;

    // player input
    const keys = {};
    window.addEventListener("keydown", (e) => {
        keys[e.key] = true;
        if (e.key === " ") e.preventDefault(); // stop page scroll on space
        if (e.key === "Enter") handleStartInput();
    });
    window.addEventListener("keyup", (e) => (keys[e.key] = false));

    // touch / click to start (mobile-friendly)
    canvas.addEventListener("pointerdown", handleStartInput);
    overlay.addEventListener("pointerdown", handleStartInput);

    function handleStartInput() {
        if (state === STATE.MENU || state === STATE.OVER) startGame();
    }

    // enemy formation setup 
    function spawnEnemies() {
        enemies = [];
        const rows = 4;
        const cols = 8;
        const gapX = 48;
        const gapY = 44;
        const offsetX = (W - (cols - 1) * gapX) / 2;
        const offsetY = 60;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                enemies.push({
                    x: offsetX + c * gapX - 16,
                    y: offsetY + r * gapY,
                    w: 32,
                    h: 32,
                    alive: true,
                    points: (rows - r) * 10 // front rows worth more
                });
            }
        }
    }

    // start / reset
    function startGame() {
        score = 0;
        lives = 3;
        bullets = [];
        enemyBullets = [];
        player.x = W / 2 - player.w / 2;
        formationDir = 1;
        formationSpeed = 0.6;
        spawnEnemies();
        updateHUD();
        overlay.classList.add("hidden");
        state = STATE.PLAYING;
    }

    function gameOver() {
        state = STATE.OVER;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem("galaga-high", String(highScore));
            highEl.textContent = highScore;
        }
        overlayTitle.textContent = "Game Over";
        overlayText.textContent = `Score ${score} - Press ENTER or TAP to play again`;
        overlay.classList.remove("hidden");
    }

    function updateHUD() {
        scoreEl.textContent = score;
        livesEl.textContent = lives;
    }

    // update loop
    function update() {
        if (state !== STATE.PLAYING) return;

        // player movement
        if (keys["ArrowLeft"] || keys["a"] || keys["A"]) player.x -= player.speed;
        if (keys["ArrowRight"] || keys["d"] || keys["D"]) player.x += player.speed;
        player.x = Math.max(0, Math.min(W - player.w, player.x));

        // player shooting
        if (player.cooldown > 0) player.cooldown--;
        if ((keys[" "] || keys["Spacebar"]) && player.cooldown === 0) {
            bullets.push({ x: player.x + player.w / 2 - 2, y: player.y, w: 4, h: 12, speed: 8 });
            player.cooldown = 14; // fire rate limiter
        }

        // move player bullets
        bullets.forEach((b) => b.y -= b.speed);
        bullets = bullets.filter((b) => b.y + b.h > 0);

        // move enemy bullets
        enemyBullets.forEach((b) => (b.y += b.speed));
        enemyBullets = enemyBullets.filter((b) => b.y < H);

        // formation drift: reverse and drop down when hitting an edge
        let minX = Infinity, maxX = -Infinity;
        enemies.forEach((e) => {
            if (!e.alive) return;
            minX = Math.min(minX, e.x);
            maxX = Math.max(maxX, e.x + e.w);
        });
        if (minX <= 0 || maxX >= W) {
            formationDir *= -1;
            enemies.forEach((e) => (e.y += 16));
        }
        enemies.forEach((e) => (e.x += formationDir * formationSpeed));

        // enemies randomly fire
        enemies.forEach((e) => {
            if (e.alive && Math.random() < 0.0015) {
                enemyBullets.push({ x: e.x + e.w / 2 - 2, y: e.y + e.h, w: 4, h: 10, speed: 4 });
            }
        });

        // collision: player bullets vs enemies 
        bullets.forEach((b) => {
            enemies.forEach((e) => {
                if (e.alive && rectsOverlap(b, e)) {
                    e.alive = false;
                    b.y = -999; // mark bullet for removal
                    score += e.points;
                    updateHUD();
                }
            });
        });
        bullets = bullets.filter((b) => b.y + b.h > 0);

        // collision: enemy bullets vs player
        enemyBullets.forEach((b) => {
            if (rectsOverlap(b, player)) {
                b.y = H + 999;
                loseLife();
            }
        });
        enemyBullets = enemyBullets.filter((b) => b.y < H);

        //enemy reaches the player line / bottom
        enemies.forEach((e) => {
            if (e.alive && e.y + e.h >= player.y) {
                loseLife();
                e.alive = false;
            }
        });

        // wave cleared -> next, slightly faster wave
        if (enemies.every((e) => !e.alive)) {
            formationSpeed += 0.25;
            spawnEnemies();
        }
    }

    function loseLife() {
        lives--;
        updateHUD();
        enemyBullets = [];
        if (lives <= 0) gameOver();
    }

    function rectsOverlap(a, b) {
        return (
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
        );
    }

    // render loop
    function draw() {
        // stars in the background
        ctx.fillStyle = "#05060f";
        ctx.fillRect(0, 0, W, H);
        drawStars();

        if (state === STATE.PLAYING) {
            // player
            drawSprite(sprites.player, player, "#4df3ff");

            // enemies
            enemies.forEach((e) => {
                if (e.alive) drawSprite(sprites.enemy, e, "#ff5a5a");
            });

            // player bullet
            bullets.forEach((b) => drawSprite(sprites.bullet, b, "#ffd23f"));

            // enemy bullets 
            ctx.fillStyle = "#ff8c00";
            enemyBullets.forEach((b) => ctx.fillRect(b.x, b.y, b.w, b.h));
        }
    }

    // draw a sprite image, or a fallback shape if the image isnt ready
    function drawSprite(img, obj, fallbackColor) {
        if (img && img.loaded) {
            ctx.drawImage(img, obj.x, obj.y, obj.w, obj.h);
        } else {
            ctx.fillStyle = fallbackColor;
            ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
        }
    }

    // twinkling stars
    const stars = Array.from({ length: 60 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.5,
        s: Math.random() * 0.5 + 0.2,
    }));
    function drawStars() {
        ctx.fillStyle = "#ffffff";
        stars.forEach((st) => {
            st.y += st.s;
            if (st.y > H) st.y = 0;
            ctx.globalAlpha = 0.6;
            ctx.fillRect(st.x, st.y, st.r, st.r);
        });
        ctx.globalAlpha = 1;
    }

    // main game loop
    function loop() {
        update();
        draw();
        requestAnimationFrame(loop);
    }

    //start from the menu screen
    overlay.classList.remove("hidden");
    loop();
})();

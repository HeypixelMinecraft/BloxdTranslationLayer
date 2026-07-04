// module code
private double jumpfunny = 0;
private long jumpticks = System.currentTimeMillis();

@EventListener
public void packetEvent(PacketEvent event) {
    if (mode.value.equals("Bloxd")) {
        if (event.packet instanceof S12PacketEntityVelocity) {
            S12PacketEntityVelocity packet = (S12PacketEntityVelocity) event.packet;
            if (mc.thePlayer != null && packet.getEntityID() == mc.thePlayer.getEntityId()) {
                jumpticks = System.currentTimeMillis() + 1300;
            }
        } else if (event.packet instanceof S3FPacketCustomPayload) {
            S3FPacketCustomPayload packet = (S3FPacketCustomPayload)event.packet;
            if ("bloxd:resyncphysics".equals(packet.getChannelName())) {
                PacketBuffer data = packet.getBufferData();
                jumpfunny = 0;
                bloxdPhysics.impulseVector.set(0, 0, 0);
                bloxdPhysics.forceVector.set(0, 0, 0);
                bloxdPhysics.velocityVector.set(data.readFloat(), data.readFloat(), data.readFloat());
            }
        }
    }
}

// event hooking Entity.moveEntity & replacing the y velocity with this, you can also use it for move dir with the strafe function of choice
if (mc.thePlayer.onGround && bloxdPhysics.velocityVector.y < 0) {
    bloxdPhysics.velocityVector.set(0, 0, 0);
}

if (event.motion.y == (double)0.42f) {
    jumpfunny = Math.min(jumpfunny + 1, 3);
    bloxdPhysics.impulseVector.add(new Vec3d(0, 8, 0));
}

jumpfunny = mc.thePlayer.groundTicks > 5 ? 0 : jumpfunny;
double speed = jumpticks > System.currentTimeMillis() && mc.timer.timerSpeed == 1 ? 1d : (mc.thePlayer.isUsingItem() ? 0.06d : 0.26d + 0.025d * jumpfunny);

if (mc.thePlayer.isPotionActive(Potion.moveSpeed)) {
    switch (mc.thePlayer.getActivePotionEffect(Potion.moveSpeed).getAmplifier()) {
        case 0:
            speed += 0.14d;
            break;
        case 1:
            speed += 0.14d;
            break;
    }
}

Vec3d moveDirection = getMoveDirection(speed);
if (mc.theWorld.isBlockLoaded(mc.thePlayer.getPosition()) || mc.thePlayer.posY <= 0) {
    bloxdPhysics.gravityMul = ModuleHandler.aura.isAttacking && bloxdPhysics.velocityVector.y >= 0 ? 4d : 2d;
    event.motion = new Vec3d(moveDirection.x, bloxdPhysics.getMotionForTick().y * (1 / 30d), moveDirection.z);
} else {
    event.motion = new Vec3d(0, 0, 0);
}
const assert = require("assert").strict;
const etherea = require("etherea");
const {
  createBitmaps,
  deployAll,
  increaseTime,
  takeSnapshot,
  revertSnapshot,
  toBinary,
} = require("./utils");

const ONE_DAY = 60 * 60 * 24;
const ONE_WEEK = ONE_DAY * 7;
const ONE_MONTH = ONE_DAY * 30;

const now = () => Math.round(Date.now());

async function add(from, to, id) {
  const invite = await from.signMessage(etherea.to.array.uint16(id));
  const { r, s, v } = etherea.signature.split(invite);
  await to.contracts.SayDAO.join(id, v, r, s);
}

describe("SayDAO Meeting Poll", async () => {
  let snapshotId;
  let alice;
  let bob;
  let carol;
  let dan;
  let erin;
  let mallory;

  beforeEach(async () => {
    snapshotId = await takeSnapshot();

    alice = await etherea.wallet({ endpoint: "localhost" });
    bob = await etherea.wallet({
      endpoint: "localhost",
      index: 1,
    });
    carol = await etherea.wallet({
      endpoint: "localhost",
      index: 2,
    });
    dan = await etherea.wallet({
      endpoint: "localhost",
      index: 4,
    });
    erin = await etherea.wallet({
      endpoint: "localhost",
      index: 5,
    });
    mallory = await etherea.wallet({
      endpoint: "localhost",
      index: 6,
    });

    // Alice deploys SayDAO
    const contracts = await deployAll(alice);

    alice.loadContracts(contracts);
    bob.loadContracts(contracts);
    carol.loadContracts(contracts);
    dan.loadContracts(contracts);
    erin.loadContracts(contracts);
    mallory.loadContracts(contracts);

    await add(alice, alice, 1);
    await add(alice, bob, 2);
    await add(alice, carol, 3);
    await add(alice, dan, 4);
    await add(alice, erin, 666);
    // Sorry Mallory you are not invited.
  });

  afterEach(async () => {
    await revertSnapshot(snapshotId);
  });

  it("allows a member to create a meeting poll and vote", async () => {
    return;
    const cid =
      "0x5f9921586542097d33e99dabc8ef759b122f20b9a77ead6a86f70e9b0af20f05";
    const secondsAfter = ONE_WEEK;
    const start = now() + ONE_MONTH;
    const end = start + ONE_DAY;

    assert(
      await bob.contracts.SayDAO.createMeetingPoll(
        cid,
        secondsAfter,
        start,
        end,
        1
      )
    );

    const poll = await alice.contracts.SayDAO.polls(0);
    const meeting = await alice.contracts.SayDAO.meetings(0);

    assert.equal(poll.cid.toHexString(), cid);
    assert(poll.meetingId.eq(0));
    assert.equal(poll.options, 2);
    assert.equal(poll.voters, 0);
    assert(poll.snapshot.eq(1));

    assert(meeting.pollId.eq(0));
    assert.equal(meeting.supervisor, 1);
    assert.equal(meeting.start.toNumber(), start);
    assert.equal(meeting.end.toNumber(), end);

    // Now Bob and Carol vote, yay!
    await bob.contracts.SayDAO.vote(0, 1);
    await carol.contracts.SayDAO.vote(0, 1);
  });

  it("allows the supervisor to create a participant list", async () => {
    const balanceOf = async (account) =>
      (await alice.contracts.SayToken.balanceOf(account))
        .div(etherea.BigNumber.from(10).pow(18))
        .toString();
    const cid =
      "0x5f9921586542097d33e99dabc8ef759b122f20b9a77ead6a86f70e9b0af20f05";
    const secondsAfter = ONE_WEEK;
    const start = now() + ONE_MONTH;
    const end = start + ONE_DAY;

    await bob.contracts.SayDAO.createMeetingPoll(
      cid,
      secondsAfter,
      start,
      end,
      // Alice is the supervisor
      1
    );

    // Alice, Bob and Carol vote "yes"
    await alice.contracts.SayDAO.vote(0, 1);
    await bob.contracts.SayDAO.vote(0, 1);
    await carol.contracts.SayDAO.vote(0, 1);

    // Let's do the time warp again
    increaseTime(end + ONE_DAY);

    // alice, bob, dan, erin
    const participantsBitmap = createBitmaps([1, 2, 4, 666]);

    // Now the supervisor can update the participants
    for (const clusterId of Object.keys(participantsBitmap)) {
      await alice.contracts.SayDAO.updateMeetingParticipants(
        0,
        clusterId,
        participantsBitmap[clusterId]
      );
    }

    let meeting = await alice.contracts.SayDAO.meetings(0);
    assert.equal(meeting.totalParticipants, 4);

    // The list of participants has been finalized, Alice seals the list
    await alice.contracts.SayDAO.sealMeetingParticipants(0);

    console.log("before");
    console.log(await balanceOf(alice.address));
    console.log(await balanceOf(bob.address));
    console.log(await balanceOf(carol.address));
    console.log(await balanceOf(dan.address));
    console.log(await balanceOf(erin.address));

    console.log(
      "Distribution bitmap",
      toBinary(await alice.contracts.SayDAO.getNextDistributionBitmap(0))
    );

    // Alice starts distributing the tokens for event 0
    await alice.contracts.SayDAO.distributeMeetingTokens(0, 128);

    assert.equal(
      (
        await alice.contracts.SayDAO.getRemainingDistributionClusters(0)
      ).toNumber(),
      1
    );

    console.log(
      "Distribution bitmap",
      toBinary(await alice.contracts.SayDAO.getNextDistributionBitmap(0))
    );

    await alice.contracts.SayDAO.distributeMeetingTokens(0, 128);

    console.log("after");
    console.log(await balanceOf(alice.address));
    console.log(await balanceOf(bob.address));
    console.log(await balanceOf(carol.address));
    console.log(await balanceOf(dan.address));
    console.log(await balanceOf(erin.address));

    assert.equal(
      (
        await alice.contracts.SayDAO.getRemainingDistributionClusters(0)
      ).toNumber(),
      0
    );
  });
});

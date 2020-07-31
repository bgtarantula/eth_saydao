const assert = require("assert").strict;
const etherea = require("etherea");
const { deployAll } = require("./utils");

async function add(from, to, id) {
  const invite = await from.signMessage(etherea.to.array.uint16(id));
  const { r, s, v } = etherea.signature.split(invite);
  await to.contracts.SayDAO.join(id, v, r, s);
}

describe("SayDAO Poll", async () => {
  let alice;
  let bob;
  let carol;
  let mallory;

  before(async () => {
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
    mallory = await etherea.wallet({
      endpoint: "localhost",
      index: 5,
    });

    // Alice deploys SayDAO
    const contracts = await deployAll(alice);

    alice.loadContracts(contracts);
    bob.loadContracts(contracts);
    carol.loadContracts(contracts);
    dan.loadContracts(contracts);
    mallory.loadContracts(contracts);

    await add(alice, bob, 1);
    await add(alice, carol, 2);
    await add(alice, dan, 3);
  });

  it("allow a member to create a poll", async () => {
    const cid =
      "0x5f9921586542097d33e99dabc8ef759b122f20b9a77ead6a86f70e9b0af20f05";
    const secondsAfter = 3600;
    const options = 2;

    assert(await bob.contracts.SayDAO.createPoll(cid, secondsAfter, options));

    const poll = await alice.contracts.SayDAO.polls(0);

    assert.equal(poll.cid.toHexString(), cid);
    assert.equal(poll.options, options);
    assert.equal(poll.voters, 0);
    assert(poll.supply.isZero());

    // Now Bob and Carol vote, yay!
    await bob.contracts.SayDAO.vote(0, 1);
    await carol.contracts.SayDAO.vote(0, 0);

    const votes = await bob.contracts.SayDAO.getVotes(0);

    assert(votes[0].eq(await bob.contracts.SayToken.balanceOf(bob.address)));
    assert(
      votes[1].eq(await carol.contracts.SayToken.balanceOf(carol.address))
    );

    // Bob tries to vote again but it doesn't work
    await assert.rejects(bob.contracts.SayDAO.vote(0, 1));

    const pollAfterVote = await alice.contracts.SayDAO.polls(0);

    assert.equal(pollAfterVote.cid.toHexString(), cid);
    assert.equal(pollAfterVote.options, options);
    assert.equal(pollAfterVote.voters, 2);
    assert(
      pollAfterVote.supply.eq(await alice.contracts.SayToken.totalSupply())
    );
    // should get last block timestamp and do the math
    //assert.equal(poll.end.toNumber(), ???);
  });

  it("doesn't allow a non member to create a poll", async () => {
    await assert.rejects(
      mallory.contracts.SayDAO.createPoll(
        // arbitrary bytes32
        "0x5f9921586542097d33e99dabc8ef759b122f20b9a77ead6a86f70e9b0af20f05",
        1,
        2
      )
    );
  });
});
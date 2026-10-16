import test from 'node:test';
import assert from 'node:assert/strict';
import {actionValuesFingerprint as f} from '../components/generativeUi/actionLifecycleState.mjs';
test('same values ignore field metadata and object order',()=>{
 assert.equal(f({name:{value:'Casey',touched:false},urgent:{value:false}}),f({urgent:{value:false,error:null},name:{value:'Casey',touched:true}}));
 assert.notEqual(f({name:{value:'Casey'}}),f({name:{value:'Alex'}}));
});
test('form groups compare only their own values',()=>{
 assert.equal(f({first:{name:{value:'Casey'}},second:{name:{value:'Old'}}},'first'),f({first:{name:{value:'Casey'}},second:{name:{value:'New'}}},'first'));
 assert.notEqual(f({count:{value:0}}),f({count:{value:false}}));
});

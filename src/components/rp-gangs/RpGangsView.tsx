import { ILinkEventTracker } from '@nitrots/nitro-renderer';
import { FC, useEffect, useState } from 'react';
import { AddEventLinkTracker, GetSessionDataManager, RemoveLinkEventTracker, SendMessageComposer } from '../../api';
import { RpGangDetailEvent, RpGangInvitesEvent, RpGetGangDetailComposer, RpGetUserGangComposer, RpUserGangEvent } from '../../api/rp-gangs/RpGangMessages';
import { GetRpGang, SetRpGang } from '../../api/rp-gangs/RpGangRegistry';
import { GANG_PERM_ADMIN, GANG_PERM_INVITE, GANG_PERM_KICK, GangDetail, GangIncomingInvite, HasGangPermission } from '../../api/rp-gangs/RpGangTypes';
import { NitroCardContentView, NitroCardHeaderView, NitroCardTabsItemView, NitroCardTabsView, NitroCardView } from '../../common';
import { useMessageEvent } from '../../hooks';
import { GangCreateView } from './GangCreateView';
import { GangInfoTab } from './GangInfoTab';
import { GangInvitesTab } from './GangInvitesTab';
import { GangManageTab } from './GangManageTab';

// the profile's gang card imports the crest from here
export { GangCrest } from './GangCrest';

// The Gang window, opened from the side drawer's gangs button
// (CreateLinkEvent('rp-gangs/toggle')) and the profile's gang card.
//
// Gangs ARE Habbo groups underneath (see
// docs/superpowers/specs/2026-09-04-gangs-on-groups-design.md). Two packets
// drive this window: RpUserGangEvent (membership, hotel-wide on every
// mutation) gates create-vs-member, and RpGangDetailEvent /
// RpGangInvitesEvent carry the state behind it - the full gang with the
// viewer's OWN permission bits, or the invites waiting on a gang-less
// player. The server pushes a fresh detail to every online member after any
// change, so nothing here re-requests after acting.

type GangTab = 'info' | 'manage' | 'invites';

export const RpGangsView: FC<{}> = props =>
{
    const [ isVisible, setIsVisible ] = useState(false);
    const [ currentTab, setCurrentTab ] = useState<GangTab>('info');
    // > 0 while looking at ANOTHER gang (rp-gangs/view/<id>, from a target's
    // crest or a profile's gang card): read-only Info, no tabs.
    const [ viewGangId, setViewGangId ] = useState(0);
    const [ detail, setDetail ] = useState<GangDetail>(null);
    const [ incomingInvites, setIncomingInvites ] = useState<GangIncomingInvite[]>([]);
    const [ gangCost, setGangCost ] = useState<number>(0);
    const [ buyPending, setBuyPending ] = useState(false);
    const [ nowSeconds, setNowSeconds ] = useState(() => Math.floor(Date.now() / 1000));
    const [ , setVersion ] = useState(0);

    const ownUserId = GetSessionDataManager().userId;

    // Request replies and hotel-wide broadcasts alike: keep the registry
    // fresh, learn the price, and re-render. When OUR membership changes
    // (founded, joined, kicked, disbanded) the window state is re-fetched so
    // the view behind the gate matches.
    useMessageEvent<RpUserGangEvent>(RpUserGangEvent, event =>
    {
        const parser = event.getParser();

        SetRpGang(parser.userId, { gangId: parser.gangId, name: parser.name, colourA: parser.colourA, colourB: parser.colourB, isOwner: parser.isOwner });

        if(parser.gangCost > 0) setGangCost(parser.gangCost);

        if(parser.userId === ownUserId)
        {
            setBuyPending(false);

            if(parser.gangId <= 0)
            {
                setDetail(null);
                setCurrentTab('info');
            }

            if(isVisible) SendMessageComposer(new RpGetGangDetailComposer(viewGangId));
        }

        setVersion(value => (value + 1));
    });

    useMessageEvent<RpGangDetailEvent>(RpGangDetailEvent, event =>
    {
        const parser = event.getParser();

        setDetail(parser.detail);

        // our own gang arriving means no invites can be pending; another
        // gang's detail says nothing about them
        if(parser.detail && (parser.detail.gangId === (GetRpGang(ownUserId)?.gangId ?? 0))) setIncomingInvites([]);
    });

    useMessageEvent<RpGangInvitesEvent>(RpGangInvitesEvent, event =>
    {
        setIncomingInvites(event.getParser().invites);
    });

    useEffect(() =>
    {
        if(!isVisible) return;

        SendMessageComposer(new RpGetUserGangComposer(ownUserId));
        SendMessageComposer(new RpGetGangDetailComposer(viewGangId));

        // one clock for every "expires in" countdown on screen
        setNowSeconds(Math.floor(Date.now() / 1000));

        const interval = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1000);

        return () => clearInterval(interval);
    }, [ isVisible, ownUserId, viewGangId ]);

    useEffect(() =>
    {
        const linkTracker: ILinkEventTracker = {
            linkReceived: (url: string) =>
            {
                const parts = url.split('/');

                if(parts.length < 2) return;

                switch(parts[1])
                {
                    case 'show':
                        setViewGangId(0);
                        setIsVisible(true);
                        return;
                    case 'hide':
                        setIsVisible(false);
                        return;
                    case 'toggle':
                        setViewGangId(0);
                        setIsVisible(prevValue => !prevValue);
                        return;
                    // rp-gangs/view/<gangId>: someone else's gang, read-only
                    case 'view':
                    {
                        const gangId = parseInt(parts[2]);

                        if(!gangId) return;

                        setDetail(null);
                        setViewGangId(gangId);
                        setCurrentTab('info');
                        setIsVisible(true);
                        return;
                    }
                }
            },
            eventUrlPrefix: 'rp-gangs/'
        };

        AddEventLinkTracker(linkTracker);

        return () => RemoveLinkEventTracker(linkTracker);
    }, []);

    const ownGang = GetRpGang(ownUserId);
    const inGang = !!ownGang;
    // looking at a gang that isn't ours (our own id through /view just shows the normal window)
    const viewingOther = ((viewGangId > 0) && (viewGangId !== (ownGang?.gangId ?? 0)));
    const viewDetail = ((viewingOther && detail && (detail.gangId === viewGangId)) ? detail : null);
    const canManage = (!!detail && (HasGangPermission(detail.permissions, GANG_PERM_ADMIN) || HasGangPermission(detail.permissions, GANG_PERM_KICK)));
    const canInvite = (!!detail && HasGangPermission(detail.permissions, GANG_PERM_INVITE));
    const showTabs = (inGang && !viewingOther && (canManage || canInvite));

    // a permission that went away (role changed under us) drops the viewer back to Info
    useEffect(() =>
    {
        if(((currentTab === 'manage') && !canManage) || ((currentTab === 'invites') && !canInvite)) setCurrentTab('info');
    }, [ currentTab, canManage, canInvite ]);

    if(!isVisible) return null;

    return (
        <NitroCardView uniqueKey="rp-gangs" className={ `nitro-rp-gangs${ (inGang || viewingOther) ? ' is-member' : '' }${ showTabs ? ' has-tabs' : '' }` } theme="primary-slim">
            <NitroCardHeaderView headerText="Gang" onCloseClick={ () => setIsVisible(false) } />
            { showTabs &&
                <NitroCardTabsView>
                    <NitroCardTabsItemView isActive={ currentTab === 'info' } onClick={ () => setCurrentTab('info') }>Info</NitroCardTabsItemView>
                    { canManage &&
                        <NitroCardTabsItemView isActive={ currentTab === 'manage' } onClick={ () => setCurrentTab('manage') }>Manage</NitroCardTabsItemView> }
                    { canInvite &&
                        <NitroCardTabsItemView isActive={ currentTab === 'invites' } onClick={ () => setCurrentTab('invites') }>Invites</NitroCardTabsItemView> }
                </NitroCardTabsView> }
            <NitroCardContentView className="text-black">
                { viewingOther && !viewDetail &&
                    <div className="gang-empty">Loading…</div> }
                { viewingOther && viewDetail &&
                    <GangInfoTab detail={ viewDetail } readOnly onBack={ inGang ? () => { setDetail(null); setViewGangId(0); } : null } /> }
                { !viewingOther && !inGang &&
                    <GangCreateView gangCost={ gangCost } buyPending={ buyPending } onBuy={ () => setBuyPending(true) } incomingInvites={ incomingInvites } nowSeconds={ nowSeconds } /> }
                { !viewingOther && inGang && !detail &&
                    <div className="gang-empty">Loading { ownGang.name }…</div> }
                { !viewingOther && inGang && detail && (currentTab === 'info') &&
                    <GangInfoTab detail={ detail } /> }
                { !viewingOther && inGang && detail && (currentTab === 'manage') && canManage &&
                    <GangManageTab detail={ detail } ownUserId={ ownUserId } onInvite={ () => setCurrentTab('invites') } /> }
                { !viewingOther && inGang && detail && (currentTab === 'invites') && canInvite &&
                    <GangInvitesTab detail={ detail } nowSeconds={ nowSeconds } /> }
            </NitroCardContentView>
        </NitroCardView>
    );
};
